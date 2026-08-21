import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateRecipeIngredientReason, recipeOwnershipError } from "@/lib/recipes/policy";
import { CatalogDuplicateError, CatalogNotFoundError } from "@/lib/services/catalog-errors";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";

const recipeSelect = {
  id: true,
  menuItemId: true,
  ingredientId: true,
  quantityRequired: true,
  ingredient: { select: { name: true, unit: true } },
} satisfies Prisma.RecipeItemSelect;

function serializeRecipeItem(item: Prisma.RecipeItemGetPayload<{ select: typeof recipeSelect }>) {
  return { id: item.id, menuItemId: item.menuItemId, ingredientId: item.ingredientId, ingredientName: item.ingredient.name, unit: item.ingredient.unit, quantityRequired: item.quantityRequired.toNumber() };
}

export async function listRecipes(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  const items = await prisma.recipeItem.findMany({
    where: { menuItem: { restaurantId: input.restaurantId }, ingredient: { restaurantId: input.restaurantId } },
    select: recipeSelect,
    orderBy: { ingredient: { name: "asc" } },
  });
  return items.map(serializeRecipeItem);
}

async function assertOwnedResources(restaurantId: string, menuItemId: string, ingredientId: string) {
  const [menuItem, ingredient] = await Promise.all([
    prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId }, select: { restaurantId: true } }),
    prisma.ingredient.findFirst({ where: { id: ingredientId, restaurantId }, select: { restaurantId: true } }),
  ]);
  const reason = recipeOwnershipError(restaurantId, menuItem?.restaurantId ?? null, ingredient?.restaurantId ?? null);
  if (reason) throw new CatalogNotFoundError(reason);
}

export async function addRecipeItem(input: { restaurantId: string; menuItemId: string; ingredientId: string; quantityRequired: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.menuItemId, "menuItemId");
  assertIdentifier(input.ingredientId, "ingredientId");
  await assertOwnedResources(input.restaurantId, input.menuItemId, input.ingredientId);
  const existing = await prisma.recipeItem.findUnique({ where: { menuItemId_ingredientId: { menuItemId: input.menuItemId, ingredientId: input.ingredientId } }, select: { id: true } });
  const duplicateReason = duplicateRecipeIngredientReason(Boolean(existing));
  if (duplicateReason) throw new CatalogDuplicateError(duplicateReason);
  try {
    return serializeRecipeItem(await prisma.recipeItem.create({ data: { menuItemId: input.menuItemId, ingredientId: input.ingredientId, quantityRequired: input.quantityRequired }, select: recipeSelect }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogDuplicateError("This ingredient is already in the recipe.");
    throw error;
  }
}

export async function updateRecipeItem(input: { restaurantId: string; recipeItemId: string; quantityRequired: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.recipeItemId, "recipeItemId");
  const item = await prisma.recipeItem.findFirst({ where: { id: input.recipeItemId, menuItem: { restaurantId: input.restaurantId }, ingredient: { restaurantId: input.restaurantId } }, select: { id: true } });
  if (!item) throw new CatalogNotFoundError("Recipe ingredient not found.");
  return serializeRecipeItem(await prisma.recipeItem.update({ where: { id: item.id }, data: { quantityRequired: input.quantityRequired }, select: recipeSelect }));
}

export async function removeRecipeItem(input: { restaurantId: string; recipeItemId: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.recipeItemId, "recipeItemId");
  const result = await prisma.recipeItem.deleteMany({ where: { id: input.recipeItemId, menuItem: { restaurantId: input.restaurantId }, ingredient: { restaurantId: input.restaurantId } } });
  if (!result.count) throw new CatalogNotFoundError("Recipe ingredient not found.");
  return { recipeItemId: input.recipeItemId, deleted: true };
}
