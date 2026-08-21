import "server-only";

import type { OrderStatusValue, OrderTypeValue } from "@/lib/orders/policy";
import { listMenuItems } from "@/lib/services/menu";
import { listOrders } from "@/lib/services/orders";
import { listRecipes } from "@/lib/services/recipes";
import { getRestaurantById } from "@/lib/services/restaurant";
import { listSuppliers } from "@/lib/services/suppliers";
import { assertRestaurantId } from "@/lib/services/validation";

export async function getSafeRestaurantProfile(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  const restaurant = await getRestaurantById(input.restaurantId);
  if (!restaurant) return null;
  return { name: restaurant.name, timezone: restaurant.timezone, currency: restaurant.currency, address: restaurant.address, guestCapacity: restaurant.guestCapacity };
}

export async function getSafeMenuCatalog(input: { restaurantId: string }) {
  return (await listMenuItems(input)).map(({ name, category, price, isActive }) => ({ name, category, price, isActive }));
}

export async function getSafeRecipeCatalog(input: { restaurantId: string }) {
  const [menuItems, recipes] = await Promise.all([listMenuItems(input), listRecipes(input)]);
  const menuNames = new Map(menuItems.map((item) => [item.id, item.name]));
  const grouped = new Map<string, Array<{ ingredientName: string; quantityRequired: number; unit: string }>>();
  for (const recipe of recipes) {
    const name = menuNames.get(recipe.menuItemId);
    if (!name) continue;
    const ingredients = grouped.get(name) ?? [];
    ingredients.push({ ingredientName: recipe.ingredientName, quantityRequired: recipe.quantityRequired, unit: recipe.unit });
    grouped.set(name, ingredients);
  }
  return menuItems.map((item) => ({ menuItemName: item.name, hasRecipe: grouped.has(item.name), ingredients: grouped.get(item.name) ?? [] }));
}

export async function getSafeSupplierDirectory(input: { restaurantId: string }) {
  return (await listSuppliers(input)).map(({ name }) => ({ name }));
}

export async function getSafeRecentOrders(input: { restaurantId: string; status?: OrderStatusValue; orderType?: OrderTypeValue; limit: number }) {
  const orders = await listOrders({ restaurantId: input.restaurantId, status: input.status, orderType: input.orderType });
  return orders.slice(0, input.limit).map(({ orderNumber, status, orderType, subtotal, discount, tax, total, inventoryConsumedAt, createdAt, items }) => ({
    orderNumber, status, orderType, subtotal, discount, tax, total, inventoryConsumedAt, createdAt,
    items: items.map(({ menuItemName, quantity, unitPrice, totalPrice }) => ({ menuItemName, quantity, unitPrice, totalPrice })),
  }));
}
