import "server-only";

import { OrderStatus, Prisma } from "@/generated/prisma/client";
import { ingredientDeletionBlockReason } from "@/lib/catalog/deletion-policy";
import { prisma } from "@/lib/prisma";
import {
  calculateIngredientUsage,
  filterLowStock,
  isLowStock,
} from "@/lib/services/calculations";
import type { DateRangeInput, StockItem } from "@/lib/services/types";
import {
  CatalogDeletionBlockedError,
  CatalogDuplicateError,
  CatalogNotFoundError,
} from "@/lib/services/catalog-errors";
import {
  assertDateRange,
  assertIdentifier,
  assertRestaurantId,
} from "@/lib/services/validation";

function toStockItem(ingredient: {
  id: string;
  name: string;
  unit: string;
  currentStock: { toNumber(): number };
  reorderLevel: { toNumber(): number };
  costPerUnit: { toNumber(): number };
}): StockItem {
  const currentStock = ingredient.currentStock.toNumber();
  const reorderLevel = ingredient.reorderLevel.toNumber();
  return {
    ingredientId: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    currentStock,
    reorderLevel,
    costPerUnit: ingredient.costPerUnit.toNumber(),
    isLowStock: isLowStock(currentStock, reorderLevel),
  };
}

async function queryInventory(restaurantId: string) {
  assertRestaurantId(restaurantId);
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId },
    select: {
      id: true,
      name: true,
      unit: true,
      currentStock: true,
      reorderLevel: true,
      costPerUnit: true,
    },
    orderBy: { name: "asc" },
  });
  return ingredients.map(toStockItem);
}

type IngredientMutationInput = {
  restaurantId: string;
  name: string;
  unit: string;
  currentStock: string;
  reorderLevel: string;
  costPerUnit: string;
};

async function assertUniqueIngredientName(restaurantId: string, name: string, excludeId?: string) {
  const duplicate = await prisma.ingredient.findFirst({
    where: {
      restaurantId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new CatalogDuplicateError("An ingredient with this name already exists.");
}

export async function getInventoryStatus(input: { restaurantId: string }) {
  const items = await queryInventory(input.restaurantId);
  const lowStockItems = filterLowStock(items);
  return {
    restaurantId: input.restaurantId,
    totalIngredients: items.length,
    lowStockCount: lowStockItems.length,
    healthyStockCount: items.length - lowStockItems.length,
    lowStockItems,
    items,
  };
}

export async function getLowStockItems(input: { restaurantId: string }) {
  return filterLowStock(await queryInventory(input.restaurantId));
}

export async function getIngredientStock(input: {
  restaurantId: string;
  ingredientId: string;
}) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.ingredientId, "ingredientId");
  const ingredient = await prisma.ingredient.findFirst({
    where: { id: input.ingredientId, restaurantId: input.restaurantId },
    select: {
      id: true,
      name: true,
      unit: true,
      currentStock: true,
      reorderLevel: true,
      costPerUnit: true,
    },
  });
  return ingredient ? toStockItem(ingredient) : null;
}

export async function createIngredient(input: IngredientMutationInput) {
  assertRestaurantId(input.restaurantId);
  await assertUniqueIngredientName(input.restaurantId, input.name);
  try {
    const ingredient = await prisma.ingredient.create({ data: input });
    return toStockItem(ingredient);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CatalogDuplicateError("An ingredient with this name already exists.");
    }
    throw error;
  }
}

export async function updateIngredient(input: IngredientMutationInput & { ingredientId: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.ingredientId, "ingredientId");
  const existing = await prisma.ingredient.findFirst({
    where: { id: input.ingredientId, restaurantId: input.restaurantId },
    select: { id: true },
  });
  if (!existing) throw new CatalogNotFoundError("Ingredient not found.");
  await assertUniqueIngredientName(input.restaurantId, input.name, input.ingredientId);
  const { ingredientId, restaurantId, ...data } = input;
  try {
    const ingredient = await prisma.ingredient.update({
      where: { id: ingredientId, restaurantId },
      data,
    });
    return toStockItem(ingredient);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CatalogDuplicateError("An ingredient with this name already exists.");
    }
    throw error;
  }
}

export async function deleteIngredient(input: { restaurantId: string; ingredientId: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.ingredientId, "ingredientId");
  return prisma.$transaction(async (transaction) => {
    const ingredient = await transaction.ingredient.findFirst({
      where: { id: input.ingredientId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!ingredient) throw new CatalogNotFoundError("Ingredient not found.");
    const [recipeItemCount, purchaseOrderItemCount] = await Promise.all([
      transaction.recipeItem.count({
        where: { ingredientId: ingredient.id, ingredient: { restaurantId: input.restaurantId } },
      }),
      transaction.purchaseOrderItem.count({
        where: { ingredientId: ingredient.id, ingredient: { restaurantId: input.restaurantId } },
      }),
    ]);
    const reason = ingredientDeletionBlockReason(recipeItemCount, purchaseOrderItemCount);
    if (reason) throw new CatalogDeletionBlockedError(reason);
    await transaction.ingredient.deleteMany({
      where: { id: ingredient.id, restaurantId: input.restaurantId },
    });
    return { ingredientId: ingredient.id, deleted: true };
  });
}

export async function getIngredientUsageEstimate(
  input: DateRangeInput & { ingredientId: string },
) {
  assertDateRange(input);
  assertIdentifier(input.ingredientId, "ingredientId");
  const ingredient = await prisma.ingredient.findFirst({
    where: { id: input.ingredientId, restaurantId: input.restaurantId },
    select: { id: true, name: true, unit: true },
  });
  if (!ingredient) return null;

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId: input.restaurantId,
        status: OrderStatus.COMPLETED,
        createdAt: { gte: input.start, lt: input.end },
      },
      menuItem: {
        restaurantId: input.restaurantId,
        recipeItems: { some: { ingredientId: input.ingredientId } },
      },
    },
    select: {
      quantity: true,
      menuItem: {
        select: {
          recipeItems: {
            where: { ingredientId: input.ingredientId },
            select: { quantityRequired: true },
          },
        },
      },
    },
  });
  const lines = orderItems.flatMap((item) =>
    item.menuItem.recipeItems.map((recipe) => ({
      orderItemQuantity: item.quantity,
      quantityRequired: recipe.quantityRequired.toNumber(),
    })),
  );

  return {
    restaurantId: input.restaurantId,
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    unit: ingredient.unit,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    estimatedUsage: calculateIngredientUsage(lines),
    contributingOrderLines: orderItems.length,
  };
}
