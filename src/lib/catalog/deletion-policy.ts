export function menuItemDeletionBlockReason(orderItemCount: number) {
  return orderItemCount > 0
    ? "This menu item appears in historical orders. Deactivate it instead of deleting it."
    : null;
}

export function ingredientDeletionBlockReason(recipeItemCount: number, purchaseOrderItemCount: number, movementCount = 0) {
  if (recipeItemCount > 0) return "This ingredient is used in one or more recipes and cannot be deleted.";
  if (purchaseOrderItemCount > 0) return "This ingredient appears in purchase-order history and cannot be deleted.";
  if (movementCount > 0) return "This ingredient has inventory movement history and cannot be deleted.";
  return null;
}
