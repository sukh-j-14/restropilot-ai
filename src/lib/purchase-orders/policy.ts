export const PURCHASE_ORDER_STATUSES = ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
export type PurchaseOrderStatusValue = (typeof PURCHASE_ORDER_STATUSES)[number];

const transitions: Record<PurchaseOrderStatusValue, PurchaseOrderStatusValue[]> = {
  DRAFT: ["ORDERED", "CANCELLED"],
  ORDERED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};

export function canTransitionPurchaseOrder(from: PurchaseOrderStatusValue, to: PurchaseOrderStatusValue) {
  return transitions[from].includes(to);
}

export function purchaseOrderTransitionError(from: PurchaseOrderStatusValue, to: PurchaseOrderStatusValue) {
  return canTransitionPurchaseOrder(from, to) ? null : `Purchase order cannot move from ${from.replaceAll("_", " ")} to ${to.replaceAll("_", " ")}.`;
}

export function duplicateIngredientReason(ingredientIds: string[]) {
  return new Set(ingredientIds).size === ingredientIds.length ? null : "Each ingredient can appear only once in a purchase order.";
}

export function purchaseOrderOwnershipError(expectedRestaurantId: string, actualRestaurantId: string | null) {
  return actualRestaurantId === expectedRestaurantId ? null : "A selected supplier or ingredient does not belong to your restaurant.";
}

export function shouldApplyInventory(previousStatus: PurchaseOrderStatusValue, nextStatus: PurchaseOrderStatusValue) {
  return nextStatus === "RECEIVED" && (previousStatus === "ORDERED" || previousStatus === "PARTIALLY_RECEIVED");
}

export function purchaseOrderReference(id: string) { return `PO-${id.slice(-8).toUpperCase()}`; }
type PurchaseOrderSnapshot = { status: string; supplierId: string; totalAmount: number; expectedAt: string | null; orderedAt: string | null; updatedAt: string; items: Array<{ ingredientId: string; quantity: number; unitCost: number }> };

export function purchaseOrderStatusSnapshotMatches(left: PurchaseOrderSnapshot, right: PurchaseOrderSnapshot) {
  if (left.status !== right.status || left.supplierId !== right.supplierId || left.totalAmount !== right.totalAmount || left.expectedAt !== right.expectedAt || left.orderedAt !== right.orderedAt || left.updatedAt !== right.updatedAt || left.items.length !== right.items.length) return false;
  const byIngredient = (items: PurchaseOrderSnapshot["items"]) => [...items].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
  const current = byIngredient(left.items); const expected = byIngredient(right.items);
  return current.every((item, index) => item.ingredientId === expected[index].ingredientId && item.quantity === expected[index].quantity && item.unitCost === expected[index].unitCost);
}
