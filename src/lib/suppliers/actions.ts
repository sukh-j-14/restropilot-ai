"use server";

import { revalidatePath } from "next/cache";
import { catalogErrorMessage, type CatalogActionState } from "@/lib/catalog/action-utils";
import { createSupplier, deleteSupplier, updateSupplier } from "@/lib/services/suppliers";
import { getCurrentRestaurant } from "@/lib/services/tenant";
import { validateSupplier } from "@/lib/suppliers/validation";

const value = (formData: FormData, name: string) => { const entry = formData.get(name); return typeof entry === "string" ? entry : ""; };
async function tenantId() { try { return (await getCurrentRestaurant())?.id ?? null; } catch { return null; } }
const fields = (formData: FormData) => ({ name: value(formData, "name"), email: value(formData, "email"), phone: value(formData, "phone") });

export async function createSupplierAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateSupplier(fields(formData));
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try { await createSupplier({ restaurantId, ...validation.data }); revalidatePath("/suppliers"); return { status: "success", message: "Supplier added." }; }
  catch (error) { return { status: "error", message: catalogErrorMessage(error) }; }
}

export async function updateSupplierAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateSupplier(fields(formData));
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try { await updateSupplier({ restaurantId, supplierId: value(formData, "supplierId"), ...validation.data }); revalidatePath("/suppliers"); return { status: "success", message: "Supplier updated." }; }
  catch (error) { return { status: "error", message: catalogErrorMessage(error) }; }
}

export async function deleteSupplierAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId(); if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  try { await deleteSupplier({ restaurantId, supplierId: value(formData, "supplierId") }); revalidatePath("/suppliers"); return { status: "success", message: "Supplier deleted." }; }
  catch (error) { return { status: "error", message: catalogErrorMessage(error) }; }
}
