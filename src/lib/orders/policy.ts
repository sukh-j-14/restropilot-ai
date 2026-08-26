export const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;
export const ORDER_TYPES = ["DINE_IN", "TAKEAWAY", "DELIVERY"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];
export type OrderTypeValue = (typeof ORDER_TYPES)[number];

type OrderSnapshot = { status?: string; orderType?: string; inventoryConsumedAt?: string | null; subtotal?: number; discount?: number; tax?: number; total?: number; items?: Array<{ menuItemId: string; quantity: number; unitPrice: number }> };

export function orderSnapshotMatches(current: OrderSnapshot, expected: OrderSnapshot) {
  if (current.status !== expected.status || current.orderType !== expected.orderType || current.inventoryConsumedAt !== expected.inventoryConsumedAt || current.subtotal !== expected.subtotal || current.discount !== expected.discount || current.tax !== expected.tax || current.total !== expected.total) return false;
  const sortItems = (items: OrderSnapshot["items"] = []) => [...items].sort((left, right) => left.menuItemId.localeCompare(right.menuItemId));
  const left = sortItems(current.items); const right = sortItems(expected.items);
  return left.length === right.length && left.every((item, index) => item.menuItemId === right[index].menuItemId && item.quantity === right[index].quantity && item.unitPrice === right[index].unitPrice);
}

const transitions: Record<OrderStatusValue, OrderStatusValue[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatusValue, to: OrderStatusValue) {
  return transitions[from].includes(to);
}

export function orderTransitionError(from: OrderStatusValue, to: OrderStatusValue) {
  return canTransitionOrder(from, to) ? null : `Order cannot move from ${from} to ${to}.`;
}

export function validateOrderStatus(value: string): OrderStatusValue | null {
  return ORDER_STATUSES.includes(value as OrderStatusValue) ? value as OrderStatusValue : null;
}

export function validateOrderType(value: string): OrderTypeValue | null {
  return ORDER_TYPES.includes(value as OrderTypeValue) ? value as OrderTypeValue : null;
}

export function orderResourceOwnershipError(restaurantId: string, resourceRestaurantIds: Array<string | null>) {
  return resourceRestaurantIds.every((id) => id === restaurantId) ? null : "One or more order resources do not belong to your restaurant.";
}

export function shouldConsumeInventory(from: OrderStatusValue, to: OrderStatusValue, inventoryConsumedAt: string | Date | null) {
  return getPreparationEligibility(from, inventoryConsumedAt) === "ELIGIBLE" && to === "PREPARING";
}

export type PreparationEligibility = "ELIGIBLE" | "ALREADY_CONSUMED" | "WRONG_STATUS" | "STALE_CLIENT";

export function getPreparationEligibility(status: OrderStatusValue, inventoryConsumedAt: unknown): PreparationEligibility {
  if (inventoryConsumedAt === undefined) return "STALE_CLIENT";
  if (inventoryConsumedAt !== null) return "ALREADY_CONSUMED";
  return status === "CONFIRMED" ? "ELIGIBLE" : "WRONG_STATUS";
}
