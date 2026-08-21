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
