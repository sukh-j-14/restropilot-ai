"use server";

import { revalidatePath } from "next/cache";
import { catalogErrorMessage, type CatalogActionState } from "@/lib/catalog/action-utils";
import { validateRecipe } from "@/lib/recipes/validation";
import { addRecipeItem, removeRecipeItem, updateRecipeItem } from "@/lib/services/recipes";
import { getCurrentRestaurant } from "@/lib/services/tenant";

const value = (formData: FormData, name: string) => { const entry = formData.get(name); return typeof entry === "string" ? entry : ""; };
async function tenantId() { try { return (await getCurrentRestaurant())?.id ?? null; } catch { return null; } }

export async function addRecipeItemAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId();
  if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateRecipe({ quantityRequired: value(formData, "quantityRequired") });
  if (!validation.success) return { status: "error", message: "Please correct the highlighted field.", fieldErrors: validation.fieldErrors };
  try {
    await addRecipeItem({ restaurantId, menuItemId: value(formData, "menuItemId"), ingredientId: value(formData, "ingredientId"), ...validation.data });
    revalidatePath("/menu"); return { status: "success", message: "Ingredient added to recipe." };
  } catch (error) { return { status: "error", message: catalogErrorMessage(error) }; }
}

export async function updateRecipeItemAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId();
  if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateRecipe({ quantityRequired: value(formData, "quantityRequired") });
  if (!validation.success) return { status: "error", message: "Please correct the highlighted field.", fieldErrors: validation.fieldErrors };
  try {
    await updateRecipeItem({ restaurantId, recipeItemId: value(formData, "recipeItemId"), ...validation.data });
    revalidatePath("/menu"); return { status: "success", message: "Recipe quantity updated." };
  } catch (error) { return { status: "error", message: catalogErrorMessage(error) }; }
}

export async function removeRecipeItemAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const restaurantId = await tenantId();
  if (!restaurantId) return { status: "error", message: "Restaurant setup is required." };
  try {
    await removeRecipeItem({ restaurantId, recipeItemId: value(formData, "recipeItemId") });
    revalidatePath("/menu"); return { status: "success", message: "Ingredient removed from recipe." };
  } catch (error) { return { status: "error", message: catalogErrorMessage(error) }; }
}
