"use server";

import { revalidatePath } from "next/cache";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { catalogErrorMessage } from "@/lib/catalog/action-utils";
import { validateIngredient } from "@/lib/catalog/validation";
import {
  createIngredient,
  deleteIngredient,
  updateIngredient,
} from "@/lib/services/inventory";
import { getCurrentRestaurant } from "@/lib/services/tenant";

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

async function restaurantId() {
  try {
    const restaurant = await getCurrentRestaurant();
    return restaurant?.id ?? null;
  } catch {
    return null;
  }
}

function ingredientFields(formData: FormData) {
  return {
    name: value(formData, "name"),
    unit: value(formData, "unit"),
    currentStock: value(formData, "currentStock"),
    reorderLevel: value(formData, "reorderLevel"),
    costPerUnit: value(formData, "costPerUnit"),
  };
}

export async function createIngredientAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateIngredient(ingredientFields(formData));
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try {
    await createIngredient({ restaurantId: tenantId, ...validation.data });
    revalidatePath("/inventory");
    return { status: "success", message: "Ingredient added." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}

export async function updateIngredientAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const ingredientId = value(formData, "ingredientId");
  const validation = validateIngredient(ingredientFields(formData));
  if (!ingredientId) return { status: "error", message: "Ingredient not found." };
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try {
    await updateIngredient({ restaurantId: tenantId, ingredientId, ...validation.data });
    revalidatePath("/inventory");
    return { status: "success", message: "Ingredient updated." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}

export async function deleteIngredientAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const ingredientId = value(formData, "ingredientId");
  if (!ingredientId) return { status: "error", message: "Ingredient not found." };
  try {
    await deleteIngredient({ restaurantId: tenantId, ingredientId });
    revalidatePath("/inventory");
    return { status: "success", message: "Ingredient deleted." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}
