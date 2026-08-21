"use server";

import { revalidatePath } from "next/cache";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { validatePurchaseOrder, validatePurchaseOrderStatus, type PurchaseOrderLineFields } from "@/lib/purchase-orders/validation";
import { PurchaseOrderError } from "@/lib/services/purchase-order-errors";
import { createPurchaseOrder, deleteDraftPurchaseOrder, transitionPurchaseOrder, updateDraftPurchaseOrder } from "@/lib/services/purchase-orders";
import { getCurrentRestaurant } from "@/lib/services/tenant";

const value = (formData: FormData, name: string) => { const entry = formData.get(name); return typeof entry === "string" ? entry : ""; };
async function tenantId() { try { return (await getCurrentRestaurant())?.id ?? null; } catch { return null; } }
function errorMessage(error: unknown) { return error instanceof PurchaseOrderError ? error.message : "Something went wrong. Please try again."; }
function fields(formData: FormData) {
  let items: PurchaseOrderLineFields[] = [];
  try {
    const parsed: unknown = JSON.parse(value(formData, "items"));
    if (Array.isArray(parsed)) items = parsed.map((item) => ({ ingredientId: typeof item?.ingredientId === "string" ? item.ingredientId : "", quantity: typeof item?.quantity === "string" ? item.quantity : "", unitCost: typeof item?.unitCost === "string" ? item.unitCost : "" }));
  } catch { /* validation reports the missing items */ }
  return { supplierId: value(formData, "supplierId"), expectedAt: value(formData, "expectedAt"), items };
}

export async function createPurchaseOrderAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validatePurchaseOrder(fields(formData));
  if (!validation.success) return { status: "error", message: validation.errors.map((error) => error.message).join(" ") };
  try { await createPurchaseOrder({ restaurantId, supplierId: validation.data.supplierId, expectedAt: validation.data.expectedAt, items: validation.data.items }); revalidatePath("/purchase-orders"); return { status: "success", message: "Draft purchase order created." }; }
  catch (error) { return { status: "error", message: errorMessage(error) }; }
}

export async function updatePurchaseOrderAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validatePurchaseOrder(fields(formData));
  if (!validation.success) return { status: "error", message: validation.errors.map((error) => error.message).join(" ") };
  try { await updateDraftPurchaseOrder({ restaurantId, purchaseOrderId: value(formData, "purchaseOrderId"), supplierId: validation.data.supplierId, expectedAt: validation.data.expectedAt, items: validation.data.items }); revalidatePath("/purchase-orders"); return { status: "success", message: "Draft purchase order updated." }; }
  catch (error) { return { status: "error", message: errorMessage(error) }; }
}

export async function transitionPurchaseOrderAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const to = validatePurchaseOrderStatus(value(formData, "to"));
  if (!to) return { status: "error", message: "Invalid purchase-order status." };
  try { const result = await transitionPurchaseOrder({ restaurantId, purchaseOrderId: value(formData, "purchaseOrderId"), to }); revalidatePath("/purchase-orders"); revalidatePath("/inventory"); return { status: "success", message: result.inventoryApplied ? "Purchase order received and inventory updated." : `Purchase order moved to ${to.replaceAll("_", " ").toLowerCase()}.` }; }
  catch (error) { return { status: "error", message: errorMessage(error) }; }
}

export async function deletePurchaseOrderAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  try { await deleteDraftPurchaseOrder({ restaurantId, purchaseOrderId: value(formData, "purchaseOrderId") }); revalidatePath("/purchase-orders"); return { status: "success", message: "Draft purchase order deleted." }; }
  catch (error) { return { status: "error", message: errorMessage(error) }; }
}
