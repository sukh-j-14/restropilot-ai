import "server-only";

import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, PurchaseOrderProposalCandidate, PurchaseOrderProposalDisplay, PurchaseOrderProposalPayload } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { resolveUniqueOperationalName } from "@/lib/ai/name-resolution";
import { validatePurchaseOrder, type PurchaseOrderLineFields } from "@/lib/purchase-orders/validation";
import {
  OPEN_INCOMING_PURCHASE_ORDER_STATUSES,
  shouldProposePurchaseOrder,
} from "@/lib/purchase-orders/incoming-policy";
import { prisma } from "@/lib/prisma";
import { PurchaseOrderError } from "@/lib/services/purchase-order-errors";
import { createPurchaseOrderInTransaction } from "@/lib/services/purchase-orders";
import { assertRestaurantId } from "@/lib/services/validation";

export type ProposalFailureCode =
  | "PROPOSAL_EXPIRED"
  | "PROPOSAL_NOT_PENDING"
  | "SUPPLIER_INVALID"
  | "INGREDIENT_INVALID"
  | "STALE_INVENTORY"
  | "CONFLICTING_PURCHASE_ORDER"
  | "INVALID_COST"
  | "INVALID_QUANTITY"
  | "TRANSACTION_CONFLICT";

function failure(code: ProposalFailureCode, message: string) {
  return { kind: "error" as const, code, message };
}

function logProposalFailure(input: {
  restaurantId: string;
  reason: ProposalFailureCode | "PURCHASE_ORDER_CREATE_FAILED";
}) {
  console.info(
    JSON.stringify({
      event: "ai_action_proposal",
      stage: "approval_failed",
      reason: input.reason,
      restaurantId: input.restaurantId,
      timestamp: new Date().toISOString(),
    }),
  );
}

function parsePayload(value: Prisma.JsonValue): PurchaseOrderProposalPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseOrderError("Proposal data is unavailable.");
  return value as unknown as PurchaseOrderProposalPayload;
}
function parseDisplay(value: Prisma.JsonValue): PurchaseOrderProposalDisplay {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseOrderError("Proposal display data is unavailable.");
  return value as unknown as PurchaseOrderProposalDisplay;
}
function publicProposal(row: { id: string; payloadJson: Prisma.JsonValue; displayJson: Prisma.JsonValue; explanation: string; expiresAt: Date }): AIActionProposal {
  const registration = getAIActionRegistration("CREATE_PURCHASE_ORDER_DRAFT")!;
  return { type: "CREATE_PURCHASE_ORDER_DRAFT", proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: parsePayload(row.payloadJson), display: parseDisplay(row.displayJson) };
}

export async function preparePurchaseOrderProposal(input: { restaurantId: string; candidate: PurchaseOrderProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  const suppliers = await prisma.supplier.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const supplier = suppliers.find((item) => item.name.toLocaleLowerCase() === input.candidate.supplierName.toLocaleLowerCase());
  if (!supplier) throw new PurchaseOrderError("The proposed supplier was not found in this restaurant.");
  const ingredientCatalog = await prisma.ingredient.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true, unit: true, currentStock: true, reorderLevel: true, costPerUnit: true }, take: 201 });
  if (ingredientCatalog.length > 200) throw new PurchaseOrderError("The ingredient catalog is too large for safe name resolution.");
  const ingredients = input.candidate.items.map((item) => resolveUniqueOperationalName(ingredientCatalog, item.ingredientName));
  if (ingredients.some((item) => !item)) throw new PurchaseOrderError("One or more proposed ingredients could not be resolved uniquely in this restaurant.");
  const resolvedIngredients = ingredients.filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (new Set(resolvedIngredients.map((item) => item.id)).size !== resolvedIngredients.length) throw new PurchaseOrderError("The proposal contains duplicate ingredient lines.");
  const ids = resolvedIngredients.map((item) => item.id);
  const history = await prisma.purchaseOrderItem.findMany({ where: { ingredientId: { in: ids }, purchaseOrder: { restaurantId: input.restaurantId, supplierId: supplier.id } }, select: { ingredientId: true, unitCost: true }, orderBy: { purchaseOrder: { createdAt: "desc" } } });
  if (suppliers.length > 1 && !history.length) throw new PurchaseOrderError("Supplier selection lacks purchase-history evidence. Ask the owner which supplier to use.");
  const openItems = await prisma.purchaseOrderItem.groupBy({ by: ["ingredientId"], where: { ingredientId: { in: ids }, purchaseOrder: { restaurantId: input.restaurantId, status: { in: [...OPEN_INCOMING_PURCHASE_ORDER_STATUSES] } } }, _sum: { quantity: true } });
  const blockedIngredient = resolvedIngredients.find((ingredient) => {
    const incomingQuantity = openItems.find((item) => item.ingredientId === ingredient.id)?._sum.quantity?.toNumber() ?? 0;
    return !shouldProposePurchaseOrder({ currentStock: ingredient.currentStock.toNumber(), reorderLevel: ingredient.reorderLevel.toNumber(), purchaseOrders: incomingQuantity > 0 ? [{ status: "ORDERED", quantity: incomingQuantity }] : [] }).shouldPropose;
  });
  if (blockedIngredient) {
    const incomingQuantity = openItems.find((item) => item.ingredientId === blockedIngredient.id)?._sum.quantity?.toNumber() ?? 0;
    if (incomingQuantity > 0) throw new PurchaseOrderError(`${blockedIngredient.name} already has ${incomingQuantity} ${blockedIngredient.unit} on an open purchase order. Review or expedite that order instead of creating another draft.`);
    throw new PurchaseOrderError(`${blockedIngredient.name} is no longer at or below its reorder level. A new draft is not currently justified.`);
  }
  const payloadItems = input.candidate.items.map((candidate) => {
    const ingredient = resolveUniqueOperationalName(resolvedIngredients, candidate.ingredientName)!;
    const historical = history.find((item) => item.ingredientId === ingredient.id);
    const unitCost = (historical?.unitCost ?? ingredient.costPerUnit).toNumber();
    return { ingredientId: ingredient.id, quantity: candidate.quantity, unitCost, stockAtProposal: ingredient.currentStock.toNumber(), reorderLevelAtProposal: ingredient.reorderLevel.toNumber(), openIncomingAtProposal: openItems.find((item) => item.ingredientId === ingredient.id)?._sum.quantity?.toNumber() ?? 0 };
  });
  const displayItems = payloadItems.map((item) => { const ingredient = resolvedIngredients.find((value) => value.id === item.ingredientId)!; return { ingredientName: ingredient.name, unit: ingredient.unit, quantity: item.quantity, unitCost: item.unitCost, lineTotal: Number((item.quantity * item.unitCost).toFixed(2)) }; });
  return { payload: { supplierId: supplier.id, items: payloadItems, ...(input.candidate.expectedAt ? { expectedAt: input.candidate.expectedAt } : {}) }, display: { supplierName: supplier.name, items: displayItems, totalAmount: Number(displayItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)) }, explanation: input.candidate.explanation };
}

export async function persistPurchaseOrderProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof preparePurchaseOrderProposal>>; now?: Date }) {
  const now = input.now ?? new Date();
  const registration = getAIActionRegistration("CREATE_PURCHASE_ORDER_DRAFT")!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: AIActionProposalType.CREATE_PURCHASE_ORDER_DRAFT, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return publicProposal(row);
}

export type ApprovalEdits = { quantities?: string[]; unitCosts?: string[]; expectedAt?: string };
export async function approvePurchaseOrderProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; edits?: ApprovalEdits; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId, type: AIActionProposalType.CREATE_PURCHASE_ORDER_DRAFT } });
    if (!proposal) return failure("PROPOSAL_NOT_PENDING", "This proposal is no longer available.");
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedPurchaseOrderId) return { kind: "already-executed" as const, purchaseOrderId: proposal.executedPurchaseOrderId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return failure("PROPOSAL_NOT_PENDING", proposal.status === AIActionProposalStatus.REJECTED ? "This proposal was rejected and cannot be approved." : "This proposal can no longer be approved.");
    if (proposal.expiresAt <= now) { await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return failure("PROPOSAL_EXPIRED", "This recommendation expired. Ask AI Manager to generate a new one."); }
    const payload = parsePayload(proposal.payloadJson);
    const ingredients = await tx.ingredient.findMany({ where: { restaurantId: input.restaurantId, id: { in: payload.items.map((item) => item.ingredientId) } }, select: { id: true, currentStock: true, reorderLevel: true } });
    const supplier = await tx.supplier.findFirst({ where: { id: payload.supplierId, restaurantId: input.restaurantId }, select: { id: true } });
    if (!supplier) return failure("SUPPLIER_INVALID", "The proposed supplier is no longer available for this restaurant.");
    if (ingredients.length !== payload.items.length) return failure("INGREDIENT_INVALID", "A proposed ingredient is no longer available for this restaurant.");
    if ((input.edits?.quantities && input.edits.quantities.length !== payload.items.length) || (input.edits?.unitCosts && input.edits.unitCosts.length !== payload.items.length)) return failure("INVALID_QUANTITY", "Proposal edits do not match the proposed items.");
    const openItems = await tx.purchaseOrderItem.groupBy({ by: ["ingredientId"], where: { ingredientId: { in: payload.items.map((item) => item.ingredientId) }, purchaseOrder: { restaurantId: input.restaurantId, status: { in: [...OPEN_INCOMING_PURCHASE_ORDER_STATUSES] } } }, _sum: { quantity: true } });
    if (openItems.some((item) => item._sum.quantity?.gt(0))) {
      await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.FAILED } });
      return failure("CONFLICTING_PURCHASE_ORDER", "You already have an open purchase order for this ingredient. Review it before creating another draft.");
    }
    const stockRecovered = payload.items.some((item) => { const current = ingredients.find((ingredient) => ingredient.id === item.ingredientId)!; return current.currentStock.gt(item.stockAtProposal) && current.currentStock.gt(current.reorderLevel); });
    if (stockRecovered) { await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.FAILED } }); return failure("STALE_INVENTORY", "Inventory changed since this recommendation was created. Generate a fresh recommendation."); }
    const lines: PurchaseOrderLineFields[] = payload.items.map((item, index) => ({ ingredientId: item.ingredientId, quantity: input.edits?.quantities?.[index] ?? String(item.quantity), unitCost: input.edits?.unitCosts?.[index] ?? String(item.unitCost) }));
    const validation = validatePurchaseOrder({ supplierId: payload.supplierId, expectedAt: input.edits?.expectedAt ?? payload.expectedAt ?? "", items: lines });
    if (!validation.success) {
      const hasCostError = validation.errors.some((error) => error.field.endsWith("unitCost"));
      return failure(hasCostError ? "INVALID_COST" : "INVALID_QUANTITY", validation.errors.map((error) => error.message).join(" "));
    }
    const claimed = await tx.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedByClerkUserId: input.clerkUserId, approvedAt: now } });
    if (!claimed.count) return failure("TRANSACTION_CONFLICT", "This proposal changed while it was being approved. Refresh before trying again.");
    const order = await createPurchaseOrderInTransaction(tx, { restaurantId: input.restaurantId, supplierId: payload.supplierId, expectedAt: validation.data.expectedAt, items: validation.data.items });
    await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedPurchaseOrderId: order.id } });
    return { kind: "created" as const, purchaseOrder: order };
  }, { maxWait: 5_000, timeout: 15_000 }).then((result) => {
    if (result.kind === "error") logProposalFailure({ restaurantId: input.restaurantId, reason: result.code });
    return result;
  }).catch((error: unknown) => {
    logProposalFailure({ restaurantId: input.restaurantId, reason: "PURCHASE_ORDER_CREATE_FAILED" });
    throw error;
  });
}

export async function rejectPurchaseOrderProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const updated = await prisma.aIActionProposal.updateMany({ where: { id: input.proposalId, restaurantId: input.restaurantId, type: AIActionProposalType.CREATE_PURCHASE_ORDER_DRAFT, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.REJECTED, rejectedAt: now, rejectedByClerkUserId: input.clerkUserId } });
  return updated.count ? { success: true as const } : { success: false as const, message: "This proposal is no longer available." };
}
