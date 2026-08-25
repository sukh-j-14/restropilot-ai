import "server-only";

import type { OrderStatusValue, OrderTypeValue } from "@/lib/orders/policy";
import { listMenuItems } from "@/lib/services/menu";
import { listOrders } from "@/lib/services/orders";
import { listRecipes } from "@/lib/services/recipes";
import { getRestaurantById } from "@/lib/services/restaurant";
import { listSuppliers } from "@/lib/services/suppliers";
import { assertRestaurantId } from "@/lib/services/validation";
import { getInventoryStatus } from "@/lib/services/inventory";
import { prisma } from "@/lib/prisma";
import { getZonedDateParts } from "@/lib/dashboard/date";

export async function getSafeRestaurantProfile(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  const restaurant = await getRestaurantById(input.restaurantId);
  if (!restaurant) return null;
  return { name: restaurant.name, phone: restaurant.phone, address: restaurant.address, timezone: restaurant.timezone, currency: restaurant.currency, guestCapacity: restaurant.guestCapacity };
}

export async function getSafeMenuCatalog(input: { restaurantId: string }) {
  return (await listMenuItems(input)).map(({ name, category, price, isActive }) => ({ name, category, price, isActive }));
}

export async function findSafeMenuItems(input: { restaurantId: string; query: string }) {
  return (await listMenuItems(input)).filter((item) => item.name.toLocaleLowerCase().includes(input.query.toLocaleLowerCase())).slice(0, 10).map(({ name, category, price, isActive }) => ({ name, category, price, isActive }));
}
export async function getSafeMenuItemDetails(input: { restaurantId: string; name: string }) { const matches = await findSafeMenuItems({ restaurantId: input.restaurantId, query: input.name }); return { matches, ambiguous: matches.length > 1 }; }
export async function getSafeMenuItemRecipe(input: { restaurantId: string; name: string }) { const recipes = await getSafeRecipeCatalog({ restaurantId: input.restaurantId }); const matches = recipes.filter((item) => item.menuItemName.toLocaleLowerCase().includes(input.name.toLocaleLowerCase())).slice(0, 10); return { matches, ambiguous: matches.length > 1 }; }
export async function getSafeIngredientDirectory(input: { restaurantId: string }) { return (await getInventoryStatus(input)).items.slice(0, 100).map(({ name, unit }) => ({ name, unit })); }
export async function findSafeIngredients(input: { restaurantId: string; query: string }) { return (await getInventoryStatus({ restaurantId: input.restaurantId })).items.filter((item) => item.name.toLocaleLowerCase().includes(input.query.toLocaleLowerCase())).slice(0, 10).map(({ name, unit, currentStock, reorderLevel, costPerUnit, isLowStock }) => ({ name, unit, currentStock, reorderLevel, costPerUnit, isLowStock })); }
export async function getSafeIngredientDetails(input: { restaurantId: string; name: string }) { const matches = await findSafeIngredients({ restaurantId: input.restaurantId, query: input.name }); return { matches, ambiguous: matches.length > 1 }; }
export async function getSafeRecentInventoryMovements(input: { restaurantId: string; ingredientName?: string }) {
  assertRestaurantId(input.restaurantId);
  const rows = await prisma.inventoryMovement.findMany({ where: { restaurantId: input.restaurantId, ...(input.ingredientName ? { ingredient: { name: { contains: input.ingredientName, mode: "insensitive" } } } : {}) }, select: { type: true, quantityDelta: true, stockBefore: true, stockAfter: true, reason: true, createdAt: true, ingredient: { select: { name: true, unit: true } } }, orderBy: { createdAt: "desc" }, take: 30 });
  return rows.map((row) => ({ ingredientName: row.ingredient.name, unit: row.ingredient.unit, type: row.type, quantityDelta: row.quantityDelta.toNumber(), stockBefore: row.stockBefore.toNumber(), stockAfter: row.stockAfter.toNumber(), reason: row.reason, createdAt: row.createdAt.toISOString() }));
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
  return (await listSuppliers(input)).slice(0, 100).map(({ name }) => ({ name }));
}

export async function findSafeSuppliers(input: { restaurantId: string; query: string }) {
  assertRestaurantId(input.restaurantId);
  const rows = await prisma.supplier.findMany({ where: { restaurantId: input.restaurantId, name: { contains: input.query, mode: "insensitive" } }, select: { name: true, email: true, phone: true, updatedAt: true }, orderBy: { name: "asc" }, take: 10 });
  return rows.map((row) => ({ name: row.name, email: row.email, phone: row.phone, updatedAt: row.updatedAt.toISOString() }));
}

export async function getSafeSupplierDetails(input: { restaurantId: string; name: string }) {
  const matches = await findSafeSuppliers({ restaurantId: input.restaurantId, query: input.name });
  return { matches, ambiguous: matches.length > 1 };
}

export async function getSafeSupplierPurchaseHistory(input: { restaurantId: string; supplierName: string }) {
  assertRestaurantId(input.restaurantId);
  const suppliers = await prisma.supplier.findMany({ where: { restaurantId: input.restaurantId, name: { contains: input.supplierName, mode: "insensitive" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 10 });
  if (suppliers.length !== 1) return { matches: suppliers.map(({ name }) => ({ name })), ambiguous: suppliers.length > 1, history: [] };
  const supplier = suppliers[0];
  const rows = await prisma.purchaseOrder.findMany({ where: { restaurantId: input.restaurantId, supplierId: supplier.id }, select: { status: true, orderedAt: true, expectedAt: true, createdAt: true, totalAmount: true, items: { select: { quantity: true, unitCost: true, ingredient: { select: { name: true, unit: true } } } } }, orderBy: { createdAt: "desc" }, take: 20 });
  return { supplierName: supplier.name, ambiguous: false, history: rows.map((row) => ({ status: row.status, orderedAt: row.orderedAt?.toISOString() ?? null, expectedAt: row.expectedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), totalAmount: row.totalAmount.toNumber(), items: row.items.map((item) => ({ ingredientName: item.ingredient.name, unit: item.ingredient.unit, quantity: item.quantity.toNumber(), unitCost: item.unitCost.toNumber() })) })) };
}

export async function findSafeSuppliersForIngredient(input: { restaurantId: string; ingredientName: string }) {
  assertRestaurantId(input.restaurantId);
  const ingredients = await prisma.ingredient.findMany({ where: { restaurantId: input.restaurantId, name: { contains: input.ingredientName, mode: "insensitive" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 10 });
  if (ingredients.length !== 1) return { matches: ingredients.map(({ name }) => ({ name })), ambiguous: ingredients.length > 1, suppliers: [] };
  const ingredient = ingredients[0];
  const rows = await prisma.purchaseOrderItem.findMany({ where: { ingredientId: ingredient.id, purchaseOrder: { restaurantId: input.restaurantId, status: { notIn: ["DRAFT", "CANCELLED"] } } }, select: { quantity: true, unitCost: true, purchaseOrder: { select: { status: true, orderedAt: true, createdAt: true, supplier: { select: { name: true } } } } }, orderBy: { purchaseOrder: { createdAt: "desc" } }, take: 30 });
  return { ingredientName: ingredient.name, ambiguous: false, suppliers: rows.map((row) => ({ supplierName: row.purchaseOrder.supplier.name, purchaseOrderStatus: row.purchaseOrder.status, quantity: row.quantity.toNumber(), unitCost: row.unitCost.toNumber(), orderedAt: row.purchaseOrder.orderedAt?.toISOString() ?? null, recordedAt: row.purchaseOrder.createdAt.toISOString() })) };
}

function reservationLocalDateTime(value: Date, timezone: string) {
  const parts = getZonedDateParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

const safeReservationSelect = { customerName: true, guestCount: true, reservationTime: true, status: true, tableNumber: true } as const;

export async function findSafeReservations(input: { restaurantId: string; customerName: string; start?: Date; end?: Date; timezone: string }) {
  assertRestaurantId(input.restaurantId);
  const rows = await prisma.reservation.findMany({
    where: { restaurantId: input.restaurantId, customerName: { contains: input.customerName, mode: "insensitive" }, ...(input.start && input.end ? { reservationTime: { gte: input.start, lt: input.end } } : {}) },
    select: safeReservationSelect,
    orderBy: { reservationTime: "asc" },
    take: 20,
  });
  return rows.map((row) => ({ ...row, reservationTime: row.reservationTime.toISOString(), localDateTime: reservationLocalDateTime(row.reservationTime, input.timezone) }));
}

export async function getSafeReservationDetails(input: { restaurantId: string; customerName: string; start?: Date; end?: Date; timezone: string }) {
  const matches = await findSafeReservations(input);
  return { matches, ambiguous: matches.length > 1 };
}

export async function listSafeUpcomingReservations(input: { restaurantId: string; start: Date; end: Date; limit: number; timezone: string }) {
  assertRestaurantId(input.restaurantId);
  const rows = await prisma.reservation.findMany({ where: { restaurantId: input.restaurantId, reservationTime: { gte: input.start, lt: input.end } }, select: safeReservationSelect, orderBy: { reservationTime: "asc" }, take: Math.min(Math.max(input.limit, 1), 50) });
  return rows.map((row) => ({ ...row, reservationTime: row.reservationTime.toISOString(), localDateTime: reservationLocalDateTime(row.reservationTime, input.timezone) }));
}

export async function getSafeRecentOrders(input: { restaurantId: string; status?: OrderStatusValue; orderType?: OrderTypeValue; limit: number }) {
  const orders = await listOrders({ restaurantId: input.restaurantId, status: input.status, orderType: input.orderType });
  return orders.slice(0, input.limit).map(({ orderNumber, status, orderType, subtotal, discount, tax, total, inventoryConsumedAt, createdAt, items }) => ({
    orderNumber, status, orderType, subtotal, discount, tax, total, inventoryConsumedAt, createdAt,
    items: items.map(({ menuItemName, quantity, unitPrice, totalPrice }) => ({ menuItemName, quantity, unitPrice, totalPrice })),
  }));
}
