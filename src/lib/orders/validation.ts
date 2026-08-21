import { validateOrderType, type OrderTypeValue } from "@/lib/orders/policy";

export type OrderLineFields = { menuItemId: string; quantity: string };
export type OrderFields = { orderType: string; discount: string; tax: string; items: OrderLineFields[] };

function money(value: string) {
  const normalized = value.trim() || "0";
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) && Number(normalized) <= 9_999_999.99 ? normalized : null;
}

export function validateOrder(fields: OrderFields):
  | { success: true; data: { orderType: OrderTypeValue; discount: string; tax: string; items: Array<{ menuItemId: string; quantity: number }> } }
  | { success: false; errors: string[] } {
  const errors: string[] = [];
  const orderType = validateOrderType(fields.orderType);
  if (!orderType) errors.push("Select a valid order type.");
  if (!fields.items.length) errors.push("Add at least one menu item.");
  const ids = fields.items.map((item) => item.menuItemId.trim());
  if (new Set(ids).size !== ids.length) errors.push("Each menu item can appear only once in an order.");
  const items = fields.items.map((item) => ({ menuItemId: item.menuItemId.trim(), quantity: Number(item.quantity) }));
  if (items.some((item) => !item.menuItemId)) errors.push("Select a menu item for every line.");
  if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) errors.push("Item quantities must be whole numbers between 1 and 999.");
  const discount = money(fields.discount);
  const tax = money(fields.tax);
  if (discount === null) errors.push("Discount must be a non-negative amount with up to 2 decimal places.");
  if (tax === null) errors.push("Tax must be a non-negative amount with up to 2 decimal places.");
  return errors.length || !orderType || discount === null || tax === null ? { success: false, errors } : { success: true, data: { orderType, discount, tax, items } };
}
