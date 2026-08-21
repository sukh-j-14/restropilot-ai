import { Prisma } from "@/generated/prisma/client";
import { duplicateIngredientReason, PURCHASE_ORDER_STATUSES, type PurchaseOrderStatusValue } from "@/lib/purchase-orders/policy";

export type PurchaseOrderLineFields = { ingredientId: string; quantity: string; unitCost: string };
export type PurchaseOrderFields = { supplierId: string; expectedAt: string; items: PurchaseOrderLineFields[] };
export type PurchaseOrderValidationError = { field: string; message: string };

function decimal(value: string, places: number, allowZero: boolean) {
  const normalized = value.trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(normalized)) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && (allowZero ? numeric >= 0 : numeric > 0) && numeric <= 999_999_999 ? normalized : null;
}

export function calculatePurchaseOrderTotal(items: PurchaseOrderLineFields[]) {
  return items.reduce((total, item) => total.plus(new Prisma.Decimal(item.quantity).mul(item.unitCost)), new Prisma.Decimal(0)).toDecimalPlaces(2).toFixed(2);
}

export function validatePurchaseOrder(fields: PurchaseOrderFields):
  | { success: true; data: Omit<PurchaseOrderFields, "expectedAt"> & { totalAmount: string; expectedAt: Date | null } }
  | { success: false; errors: PurchaseOrderValidationError[] } {
  const errors: PurchaseOrderValidationError[] = [];
  const supplierId = fields.supplierId.trim();
  if (!supplierId) errors.push({ field: "supplierId", message: "Select a supplier." });
  if (!fields.items.length) errors.push({ field: "items", message: "Add at least one ingredient." });
  const duplicate = duplicateIngredientReason(fields.items.map((item) => item.ingredientId));
  if (duplicate) errors.push({ field: "items", message: duplicate });
  const items = fields.items.map((item, index) => {
    const ingredientId = item.ingredientId.trim();
    const quantity = decimal(item.quantity, 3, false);
    const unitCost = decimal(item.unitCost, 4, true);
    if (!ingredientId) errors.push({ field: `items.${index}.ingredientId`, message: "Select an ingredient." });
    if (!quantity) errors.push({ field: `items.${index}.quantity`, message: "Quantity must be greater than zero with up to 3 decimal places." });
    if (!unitCost) errors.push({ field: `items.${index}.unitCost`, message: "Unit cost must be zero or greater with up to 4 decimal places." });
    return { ingredientId, quantity: quantity ?? item.quantity, unitCost: unitCost ?? item.unitCost };
  });
  let expectedAt: Date | null = null;
  if (fields.expectedAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.expectedAt)) errors.push({ field: "expectedAt", message: "Enter a valid expected date." });
    else {
      expectedAt = new Date(`${fields.expectedAt}T00:00:00.000Z`);
      if (Number.isNaN(expectedAt.getTime()) || expectedAt.toISOString().slice(0, 10) !== fields.expectedAt) errors.push({ field: "expectedAt", message: "Enter a valid expected date." });
    }
  }
  if (errors.length) return { success: false, errors };
  return { success: true, data: { supplierId, expectedAt, items, totalAmount: calculatePurchaseOrderTotal(items) } };
}

export function validatePurchaseOrderStatus(value: string): PurchaseOrderStatusValue | null {
  return PURCHASE_ORDER_STATUSES.includes(value as PurchaseOrderStatusValue) ? value as PurchaseOrderStatusValue : null;
}
