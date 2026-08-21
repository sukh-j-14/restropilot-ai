export const OPEN_INCOMING_PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "ORDERED",
  "PARTIALLY_RECEIVED",
] as const;

export type IncomingPurchaseOrderStatus =
  (typeof OPEN_INCOMING_PURCHASE_ORDER_STATUSES)[number];

export function isOpenIncomingPurchaseOrderStatus(status: string) {
  return OPEN_INCOMING_PURCHASE_ORDER_STATUSES.includes(
    status as IncomingPurchaseOrderStatus,
  );
}

export function calculateEffectiveStock(
  currentStock: number,
  incomingQuantity: number,
) {
  return Number((currentStock + incomingQuantity).toFixed(3));
}

export function hasConflictingOpenPurchaseOrder(
  purchaseOrders: Array<{ status: string; quantity: number }>,
) {
  return purchaseOrders.some(
    (order) =>
      isOpenIncomingPurchaseOrderStatus(order.status) && order.quantity > 0,
  );
}

export function shouldProposePurchaseOrder(input: {
  currentStock: number;
  reorderLevel: number;
  purchaseOrders: Array<{ status: string; quantity: number }>;
}) {
  const incomingQuantity = input.purchaseOrders
    .filter((order) => isOpenIncomingPurchaseOrderStatus(order.status))
    .reduce((total, order) => total + order.quantity, 0);
  const effectiveStock = calculateEffectiveStock(
    input.currentStock,
    incomingQuantity,
  );

  // V1 deliberately avoids delivery-timing forecasts. Any genuinely open line
  // must be reviewed or expedited instead of creating a second draft.
  return {
    incomingQuantity,
    effectiveStock,
    hasOpenIncoming: incomingQuantity > 0,
    shouldPropose: incomingQuantity === 0 && effectiveStock <= input.reorderLevel,
  };
}
