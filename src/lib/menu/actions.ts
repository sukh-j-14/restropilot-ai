"use server";

import { revalidatePath } from "next/cache";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { catalogErrorMessage } from "@/lib/catalog/action-utils";
import { validateMenuItem } from "@/lib/catalog/validation";
import {
  createMenuItem,
  deleteMenuItem,
  setMenuItemActive,
  updateMenuItem,
} from "@/lib/services/menu";
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

export async function createMenuItemAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const validation = validateMenuItem({
    name: value(formData, "name"),
    category: value(formData, "category"),
    price: value(formData, "price"),
  });
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try {
    await createMenuItem({ restaurantId: tenantId, ...validation.data });
    revalidatePath("/menu");
    return { status: "success", message: "Menu item added." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}

export async function updateMenuItemAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const menuItemId = value(formData, "menuItemId");
  const validation = validateMenuItem({
    name: value(formData, "name"),
    category: value(formData, "category"),
    price: value(formData, "price"),
  });
  if (!menuItemId) return { status: "error", message: "Menu item not found." };
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try {
    await updateMenuItem({ restaurantId: tenantId, menuItemId, ...validation.data });
    revalidatePath("/menu");
    return { status: "success", message: "Menu item updated." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}

export async function toggleMenuItemAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const menuItemId = value(formData, "menuItemId");
  if (!menuItemId) return { status: "error", message: "Menu item not found." };
  try {
    const isActive = value(formData, "isActive") === "true";
    await setMenuItemActive({ restaurantId: tenantId, menuItemId, isActive });
    revalidatePath("/menu");
    return { status: "success", message: isActive ? "Menu item activated." : "Menu item deactivated." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}

export async function deleteMenuItemAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  const menuItemId = value(formData, "menuItemId");
  if (!menuItemId) return { status: "error", message: "Menu item not found." };
  try {
    await deleteMenuItem({ restaurantId: tenantId, menuItemId });
    revalidatePath("/menu");
    return { status: "success", message: "Menu item deleted." };
  } catch (error) {
    return { status: "error", message: catalogErrorMessage(error) };
  }
}
