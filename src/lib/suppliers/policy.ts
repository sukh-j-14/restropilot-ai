export function supplierDeletionBlockReason(purchaseOrderCount: number) {
  return purchaseOrderCount > 0 ? "This supplier cannot be deleted because it has purchase-order history." : null;
}
