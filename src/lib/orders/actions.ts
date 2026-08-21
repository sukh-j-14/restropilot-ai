"use server";

import { revalidatePath } from "next/cache";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { validateOrderStatus } from "@/lib/orders/policy";
import { validateOrder, type OrderLineFields } from "@/lib/orders/validation";
import { OrderWorkflowError } from "@/lib/services/order-errors";
import { createOrder, transitionOrder } from "@/lib/services/orders";
import { getCurrentRestaurant } from "@/lib/services/tenant";

const value = (formData: FormData, name: string) => { const entry = formData.get(name); return typeof entry === "string" ? entry : ""; };
async function tenantId() { try { return (await getCurrentRestaurant())?.id ?? null; } catch { return null; } }
function message(error: unknown) { return error instanceof OrderWorkflowError ? error.message : "Something went wrong. Please try again."; }

function fields(formData: FormData) {
  let items: OrderLineFields[] = [];
  try {
    const parsed: unknown = JSON.parse(value(formData, "items"));
    if (Array.isArray(parsed)) items = parsed.map((item) => ({ menuItemId: typeof item?.menuItemId === "string" ? item.menuItemId : "", quantity: typeof item?.quantity === "string" ? item.quantity : "" }));
  } catch { /* validation handles malformed lines */ }
  return { orderType: value(formData, "orderType"), discount: value(formData, "discount"), tax: value(formData, "tax"), items };
}

export async function createOrderAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId();
  if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateOrder(fields(formData));
  if (!validation.success) return { status: "error", message: validation.errors.join(" ") };
  try {
    await createOrder({ restaurantId, ...validation.data });
    revalidatePath("/orders"); revalidatePath("/");
    return { status: "success", message: "Order created." };
  } catch (error) { return { status: "error", message: message(error) }; }
}

export async function transitionOrderAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId();
  if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const to = validateOrderStatus(value(formData, "to"));
  if (!to) return { status: "error", message: "Invalid order status." };
  try {
    const result = await transitionOrder({ restaurantId, orderId: value(formData, "orderId"), to });
    revalidatePath("/orders"); revalidatePath("/inventory"); revalidatePath("/");
    return { status: "success", message: result.inventoryConsumed ? "Preparation started and recipe inventory was consumed." : to === "CANCELLED" && result.inventoryConsumedAt ? "Order cancelled. Previously consumed inventory was not restored." : `Order moved to ${to.toLowerCase()}.` };
  } catch (error) { return { status: "error", message: message(error) }; }
}
