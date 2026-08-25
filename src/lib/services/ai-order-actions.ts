import "server-only";

import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, OrderProposalCandidate, OrderProposalDisplay, OrderProposalPayload } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { calculateOrderTotals } from "@/lib/orders/calculations";
import { canTransitionOrder, validateOrderStatus, validateOrderType, type OrderTypeValue } from "@/lib/orders/policy";
import { prisma } from "@/lib/prisma";
import { createOrderInTransaction, transitionOrderInTransaction, updateOrderItemsInTransaction } from "@/lib/services/orders";
import { OrderWorkflowError } from "@/lib/services/order-errors";
import { assertRestaurantId } from "@/lib/services/validation";

const orderTypes = new Set(["CREATE_ORDER", "UPDATE_ORDER_ITEMS", "TRANSITION_ORDER_STATUS"]);
const selectOrder = { id: true, orderNumber: true, status: true, orderType: true, subtotal: true, discount: true, tax: true, total: true, inventoryConsumedAt: true, items: { select: { menuItemId: true, quantity: true, unitPrice: true, menuItem: { select: { name: true } } }, orderBy: { id: "asc" as const } } } as const;
type ExistingOrder = Prisma.OrderGetPayload<{ select: typeof selectOrder }>;
const money = (value: Prisma.Decimal | number) => Number(value);
const snapshot = (order: ExistingOrder): OrderProposalPayload["snapshot"] => ({ status: order.status, orderType: order.orderType, inventoryConsumedAt: order.inventoryConsumedAt?.toISOString() ?? null, subtotal: money(order.subtotal), discount: money(order.discount), tax: money(order.tax), total: money(order.total), items: order.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity, unitPrice: money(item.unitPrice) })).sort((a, b) => a.menuItemId.localeCompare(b.menuItemId)) });
function snapshotsEqual(order: ExistingOrder, expected: OrderProposalPayload["snapshot"]) { return JSON.stringify(snapshot(order)) === JSON.stringify({ ...expected, items: expected.items?.slice().sort((a, b) => a.menuItemId.localeCompare(b.menuItemId)) }); }

export async function prepareOrderProposal(input: { restaurantId: string; candidate: OrderProposalCandidate }) {
  assertRestaurantId(input.restaurantId); const candidate = input.candidate;
  let existing: ExistingOrder | null = null;
  if (candidate.actionType !== "CREATE_ORDER") {
    existing = await prisma.order.findFirst({ where: { restaurantId: input.restaurantId, orderNumber: { equals: candidate.orderNumber!, mode: "insensitive" } }, select: selectOrder });
    if (!existing) throw new Error("That order number was not found in this restaurant.");
  }
  const targetStatus = candidate.status ? validateOrderStatus(candidate.status) : null;
  if (candidate.actionType === "TRANSITION_ORDER_STATUS" && (!targetStatus || !canTransitionOrder(existing!.status, targetStatus))) throw new Error("That order status transition is not allowed.");
  if (candidate.actionType === "UPDATE_ORDER_ITEMS" && (!(["PENDING", "CONFIRMED"] as string[]).includes(existing!.status) || existing!.inventoryConsumedAt)) throw new Error("Order items can only be changed before preparation begins.");
  const orderType = validateOrderType(candidate.orderType ?? existing?.orderType ?? "");
  const proposedItems = candidate.items;
  if (candidate.actionType !== "TRANSITION_ORDER_STATUS" && (!orderType || !proposedItems?.length)) throw new Error("A supported order type and at least one item are required.");
  const names = proposedItems?.map((item) => item.menuItemName) ?? [];
  if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) throw new Error("Each menu item can appear only once.");
  const menu = names.length ? await prisma.menuItem.findMany({ where: { restaurantId: input.restaurantId, isActive: true, OR: names.map((name) => ({ name: { equals: name, mode: "insensitive" } })) }, select: { id: true, name: true, price: true } }) : [];
  if (menu.length !== names.length) throw new Error("One or more menu items were not uniquely found or are unavailable.");
  const byName = new Map(menu.map((item) => [item.name.toLocaleLowerCase(), item]));
  const lines = proposedItems?.map((item) => { const found = byName.get(item.menuItemName.toLocaleLowerCase()); if (!found) throw new Error(`Menu item '${item.menuItemName}' was not found.`); return { menuItemId: found.id, menuItemName: found.name, quantity: item.quantity, unitPrice: money(found.price), totalPrice: money(found.price.mul(item.quantity).toDecimalPlaces(2)) }; }) ?? [];
  const discount = candidate.discount ?? (existing ? money(existing.discount) : 0); const tax = candidate.tax ?? (existing ? money(existing.tax) : 0);
  const totals = lines.length ? calculateOrderTotals(lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, unitPrice: String(line.unitPrice) })), String(discount), String(tax)) : null;
  if (totals && Number(totals.discount) > Number(totals.subtotal)) throw new Error("Discount cannot exceed the subtotal.");
  const payload: OrderProposalPayload = { orderId: existing?.id, orderNumber: existing?.orderNumber, orderType: orderType ?? existing?.orderType, items: lines.map(({ menuItemId, quantity, unitPrice }) => ({ menuItemId, quantity, unitPrice })), discount, tax, status: targetStatus ?? undefined, snapshot: existing ? snapshot(existing) : {} };
  const changes = candidate.actionType === "TRANSITION_ORDER_STATUS" ? [{ label: "Status", current: existing!.status, proposed: targetStatus! }] : candidate.actionType === "CREATE_ORDER" ? [{ label: "Status", proposed: "PENDING" }] : [{ label: "Items", current: `${existing!.items.length} line(s)`, proposed: `${lines.length} line(s)` }, { label: "Total", current: String(money(existing!.total)), proposed: totals!.total }];
  const display: OrderProposalDisplay = { orderNumber: existing?.orderNumber, orderType: orderType ?? existing?.orderType, items: lines.map(({ menuItemName, quantity, unitPrice, totalPrice }) => ({ menuItemName, quantity, unitPrice, totalPrice })), subtotal: totals ? Number(totals.subtotal) : money(existing!.subtotal), discount, tax, total: totals ? Number(totals.total) : money(existing!.total), currentStatus: existing?.status, proposedStatus: targetStatus ?? (candidate.actionType === "CREATE_ORDER" ? "PENDING" : existing?.status), changes };
  return { type: candidate.actionType, payload, display, explanation: candidate.explanation };
}

export async function persistOrderProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof prepareOrderProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date(); const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: input.prepared.type as AIActionProposalType, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display } as AIActionProposal;
}

export async function executeOrderProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  try { return await prisma.$transaction(async (transaction) => {
    const proposal = await transaction.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || !orderTypes.has(proposal.type)) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const payload = proposal.payloadJson as unknown as OrderProposalPayload;
    const order = payload.orderId ? await transaction.order.findFirst({ where: { id: payload.orderId, restaurantId: input.restaurantId }, select: selectOrder }) : null;
    if (payload.orderId && (!order || !snapshotsEqual(order, payload.snapshot))) return { kind: "error" as const, message: "The order changed since this proposal was created. Generate a fresh proposal." };
    const ids = payload.items?.map((item) => item.menuItemId) ?? [];
    if (ids.length) { const menu = await transaction.menuItem.findMany({ where: { id: { in: ids }, restaurantId: input.restaurantId, isActive: true }, select: { id: true, price: true } }); const priceMap = new Map(menu.map((item) => [item.id, money(item.price)])); if (menu.length !== ids.length || payload.items!.some((item) => priceMap.get(item.menuItemId) !== item.unitPrice)) return { kind: "error" as const, message: "Menu availability or pricing changed. Generate a fresh order proposal." }; }
    const claimed = await transaction.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    const base = { restaurantId: input.restaurantId, orderType: payload.orderType as OrderTypeValue, discount: String(payload.discount ?? 0), tax: String(payload.tax ?? 0), items: (payload.items ?? []).map(({ menuItemId, quantity }) => ({ menuItemId, quantity })) };
    const result = proposal.type === "CREATE_ORDER" ? await createOrderInTransaction(transaction, base)
      : proposal.type === "UPDATE_ORDER_ITEMS" ? await updateOrderItemsInTransaction(transaction, { ...base, orderId: order!.id, expectedStatus: order!.status, expectedInventoryConsumedAt: order!.inventoryConsumedAt })
      : await transitionOrderInTransaction(transaction, { restaurantId: input.restaurantId, orderId: order!.id, to: validateOrderStatus(payload.status ?? "")!, expectedStatus: order!.status, expectedInventoryConsumedAt: order!.inventoryConsumedAt });
    const resourceId = "id" in result ? result.id : result.orderId;
    await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: resourceId } });
    return { kind: "executed" as const, resourceId };
  }, { maxWait: 5_000, timeout: 20_000 }); } catch (error) { return { kind: "error" as const, message: error instanceof OrderWorkflowError ? error.message : "The order action could not be completed. No changes were applied." }; }
}
