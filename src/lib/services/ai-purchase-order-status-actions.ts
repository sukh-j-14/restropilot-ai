import "server-only";

import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, PurchaseOrderStatusProposalCandidate, PurchaseOrderStatusProposalDisplay, PurchaseOrderStatusProposalPayload, PurchaseOrderStatusSnapshot } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { prisma } from "@/lib/prisma";
import { canTransitionPurchaseOrder, PURCHASE_ORDER_STATUSES, purchaseOrderReference, shouldApplyInventory, type PurchaseOrderStatusValue } from "@/lib/purchase-orders/policy";
import { findPurchaseOrders, purchaseOrderSnapshot, transitionPurchaseOrderInTransaction } from "@/lib/services/purchase-orders";
import { assertRestaurantId } from "@/lib/services/validation";

function validStatus(value: string): value is PurchaseOrderStatusValue { return PURCHASE_ORDER_STATUSES.includes(value as PurchaseOrderStatusValue); }
function sameSnapshot(left: PurchaseOrderStatusSnapshot, right: PurchaseOrderStatusSnapshot) { return JSON.stringify(left) === JSON.stringify(right); }

export async function preparePurchaseOrderStatusProposal(input: { restaurantId: string; candidate: PurchaseOrderStatusProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  if (!validStatus(input.candidate.status)) throw new Error("The requested purchase-order status is invalid.");
  const matches = await findPurchaseOrders({ restaurantId: input.restaurantId, reference: input.candidate.reference, supplierName: input.candidate.supplierName, ...(input.candidate.currentStatus && validStatus(input.candidate.currentStatus) ? { status: input.candidate.currentStatus } : {}), limit: 3 });
  if (!matches.length) throw new Error("No matching purchase order was found in this restaurant.");
  if (matches.length !== 1) throw new Error("More than one purchase order matches. Ask the owner to choose a specific PO reference.");
  const order = matches[0];
  if (!canTransitionPurchaseOrder(order.status, input.candidate.status)) throw new Error(`Purchase order cannot move from ${order.status.replaceAll("_", " ")} to ${input.candidate.status.replaceAll("_", " ")}.`);
  const payload: PurchaseOrderStatusProposalPayload = { purchaseOrderId: order.id, status: input.candidate.status, snapshot: purchaseOrderSnapshot(order) };
  const display: PurchaseOrderStatusProposalDisplay = { reference: purchaseOrderReference(order.id), supplierName: order.supplier.name, currentStatus: order.status, proposedStatus: input.candidate.status, totalAmount: order.totalAmount, items: order.items.map((item) => ({ ingredientName: item.ingredientName, unit: item.unit, quantity: item.quantity, unitCost: item.unitCost })), inventoryImpact: shouldApplyInventory(order.status, input.candidate.status) };
  return { type: "TRANSITION_PURCHASE_ORDER_STATUS" as const, payload, display, explanation: input.candidate.explanation };
}

export async function persistPurchaseOrderStatusProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof preparePurchaseOrderStatusProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date(); const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: AIActionProposalType.TRANSITION_PURCHASE_ORDER_STATUS, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display };
}

export async function executePurchaseOrderStatusProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const proposal = await transaction.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || proposal.type !== AIActionProposalType.TRANSITION_PURCHASE_ORDER_STATUS) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const payload = proposal.payloadJson as unknown as PurchaseOrderStatusProposalPayload;
    if (!payload || typeof payload.purchaseOrderId !== "string" || !validStatus(payload.status) || !payload.snapshot) return { kind: "error" as const, message: "The proposed purchase-order change is invalid." };
    const current = await transaction.purchaseOrder.findFirst({ where: { id: payload.purchaseOrderId, restaurantId: input.restaurantId }, include: { supplier: { select: { id: true } }, items: { select: { ingredientId: true, quantity: true, unitCost: true }, orderBy: { ingredientId: "asc" } } } });
    if (!current) return { kind: "error" as const, message: "The purchase order is no longer available." };
    const currentSnapshot: PurchaseOrderStatusSnapshot = { status: current.status, supplierId: current.supplier.id, totalAmount: current.totalAmount.toNumber(), expectedAt: current.expectedAt?.toISOString() ?? null, orderedAt: current.orderedAt?.toISOString() ?? null, updatedAt: current.updatedAt.toISOString(), items: current.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity.toNumber(), unitCost: item.unitCost.toNumber() })) };
    if (!sameSnapshot(currentSnapshot, payload.snapshot)) return { kind: "error" as const, message: "The purchase order changed since this proposal was created. Generate a fresh proposal." };
    if (!canTransitionPurchaseOrder(current.status, payload.status)) return { kind: "error" as const, message: "This purchase-order status change is no longer allowed." };
    const claimed = await transaction.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    const result = await transitionPurchaseOrderInTransaction(transaction, { restaurantId: input.restaurantId, purchaseOrderId: current.id, to: payload.status });
    await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: current.id } });
    return { kind: "executed" as const, resourceId: current.id, status: result.status, inventoryApplied: result.inventoryApplied };
  }, { maxWait: 5_000, timeout: 20_000 });
}
