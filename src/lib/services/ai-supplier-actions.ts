import "server-only";

import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, SupplierProposalCandidate, SupplierProposalDisplay, SupplierProposalPayload } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { prisma } from "@/lib/prisma";
import { createSupplierInTransaction, updateSupplierInTransaction } from "@/lib/services/suppliers";
import { assertRestaurantId } from "@/lib/services/validation";
import { validateSupplier } from "@/lib/suppliers/validation";
import { resolveSupplierMatch, supplierSnapshotMatches } from "@/lib/suppliers/ai-policy";

const supplierTypes = new Set(["CREATE_SUPPLIER", "UPDATE_SUPPLIER"]);
const normalized = (value: string) => value.trim().toLocaleLowerCase();

function resolveSupplier<T extends { id: string; name: string }>(suppliers: T[], query: string) { const result = resolveSupplierMatch(suppliers, query); if (result.kind === "resolved") return result.supplier; if (result.kind === "ambiguous") throw new Error(`Multiple suppliers match '${query}'. Ask the user to choose an exact supplier name.`); throw new Error(`Supplier '${query}' was not found in this restaurant.`); }

function change(label: string, current: string | null | undefined, proposed: string | null | undefined) {
  return { label, ...(current !== undefined ? { current: current ?? "Not set" } : {}), ...(proposed !== undefined ? { proposed: proposed || "Not set" } : {}) };
}

export async function prepareSupplierProposal(input: { restaurantId: string; candidate: SupplierProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  const suppliers = await prisma.supplier.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true, email: true, phone: true, updatedAt: true }, orderBy: { name: "asc" } });
  const candidate = input.candidate;
  const supplier = candidate.actionType === "UPDATE_SUPPLIER" ? resolveSupplier(suppliers, candidate.supplierName) : undefined;
  const proposed = validateSupplier({ name: candidate.name ?? candidate.supplierName, email: candidate.email ?? supplier?.email ?? "", phone: candidate.phone ?? supplier?.phone ?? "" });
  if (!proposed.success) throw new Error("The proposed supplier fields are invalid.");
  if (suppliers.some((item) => item.id !== supplier?.id && normalized(item.name) === normalized(proposed.data.name))) throw new Error("A supplier with this name already exists.");
  const changes = candidate.actionType === "CREATE_SUPPLIER"
    ? [change("Name", undefined, proposed.data.name), change("Email", undefined, proposed.data.email), change("Phone", undefined, proposed.data.phone)].filter((item) => item.proposed !== "Not set")
    : [change("Name", supplier!.name, candidate.name), change("Email", supplier!.email, candidate.email), change("Phone", supplier!.phone, candidate.phone)].filter((item) => item.proposed !== undefined);
  if (!changes.length || (supplier && proposed.data.name === supplier.name && proposed.data.email === (supplier.email ?? "") && proposed.data.phone === (supplier.phone ?? ""))) throw new Error("The proposed supplier details already match the current values.");
  const payload: SupplierProposalPayload = { supplierId: supplier?.id, name: proposed.data.name, email: proposed.data.email, phone: proposed.data.phone, snapshot: { name: supplier?.name, email: supplier?.email, phone: supplier?.phone, updatedAt: supplier?.updatedAt.toISOString() } };
  const display: SupplierProposalDisplay = { supplierName: supplier?.name ?? proposed.data.name, changes };
  return { type: candidate.actionType, payload, display, explanation: candidate.explanation };
}

export async function persistSupplierProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof prepareSupplierProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date();
  const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: input.prepared.type as AIActionProposalType, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display } as AIActionProposal;
}

export async function executeSupplierProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const proposal = await transaction.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || !supplierTypes.has(proposal.type)) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const payload = proposal.payloadJson as unknown as SupplierProposalPayload;
    const validation = validateSupplier({ name: payload.name ?? "", email: payload.email ?? "", phone: payload.phone ?? "" });
    if (!validation.success) return { kind: "error" as const, message: "The proposed supplier fields are no longer valid." };
    const supplier = payload.supplierId ? await transaction.supplier.findFirst({ where: { id: payload.supplierId, restaurantId: input.restaurantId }, select: { id: true, name: true, email: true, phone: true, updatedAt: true } }) : null;
    if (payload.supplierId && !supplier) return { kind: "error" as const, message: "The supplier is no longer available for this restaurant." };
    if (proposal.type === "UPDATE_SUPPLIER" && (!supplier || !supplierSnapshotMatches(supplier, payload.snapshot))) return { kind: "error" as const, message: "The supplier changed since this proposal was created. Generate a fresh proposal." };
    const duplicate = await transaction.supplier.findFirst({ where: { restaurantId: input.restaurantId, name: { equals: validation.data.name, mode: "insensitive" }, ...(supplier ? { id: { not: supplier.id } } : {}) }, select: { id: true } });
    if (duplicate) return { kind: "error" as const, message: "A supplier with this name already exists." };
    const claimed = await transaction.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    const result = proposal.type === "CREATE_SUPPLIER"
      ? await createSupplierInTransaction(transaction, { restaurantId: input.restaurantId, ...validation.data })
      : await updateSupplierInTransaction(transaction, { restaurantId: input.restaurantId, supplierId: supplier!.id, ...validation.data });
    await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: result.id } });
    return { kind: "executed" as const, resourceId: result.id };
  }, { maxWait: 5_000, timeout: 15_000 });
}
