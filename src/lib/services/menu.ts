import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { menuItemDeletionBlockReason } from "@/lib/catalog/deletion-policy";
import { prisma } from "@/lib/prisma";
import {
  CatalogDeletionBlockedError,
  CatalogDuplicateError,
  CatalogNotFoundError,
} from "@/lib/services/catalog-errors";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";

type MenuMutationInput = {
  restaurantId: string;
  name: string;
  category: string;
  price: string;
};

function serializeMenuItem(item: {
  id: string;
  name: string;
  category: string;
  price: { toNumber(): number };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price.toNumber(),
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function assertUniqueName(restaurantId: string, name: string, excludeId?: string) {
  const duplicate = await prisma.menuItem.findFirst({
    where: {
      restaurantId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new CatalogDuplicateError("A menu item with this name already exists.");
}

export async function listMenuItems(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: input.restaurantId },
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
  });
  return items.map(serializeMenuItem);
}

export async function createMenuItem(input: MenuMutationInput) {
  assertRestaurantId(input.restaurantId);
  await assertUniqueName(input.restaurantId, input.name);
  try {
    return serializeMenuItem(await prisma.menuItem.create({ data: input }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CatalogDuplicateError("A menu item with this name already exists.");
    }
    throw error;
  }
}

export async function updateMenuItem(input: MenuMutationInput & { menuItemId: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.menuItemId, "menuItemId");
  const existing = await prisma.menuItem.findFirst({
    where: { id: input.menuItemId, restaurantId: input.restaurantId },
    select: { id: true },
  });
  if (!existing) throw new CatalogNotFoundError("Menu item not found.");
  await assertUniqueName(input.restaurantId, input.name, input.menuItemId);
  const { menuItemId, restaurantId, ...data } = input;
  try {
    return serializeMenuItem(await prisma.menuItem.update({ where: { id: menuItemId, restaurantId }, data }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CatalogDuplicateError("A menu item with this name already exists.");
    }
    throw error;
  }
}

export async function setMenuItemActive(input: { restaurantId: string; menuItemId: string; isActive: boolean }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.menuItemId, "menuItemId");
  const result = await prisma.menuItem.updateMany({
    where: { id: input.menuItemId, restaurantId: input.restaurantId },
    data: { isActive: input.isActive },
  });
  if (!result.count) throw new CatalogNotFoundError("Menu item not found.");
  return { menuItemId: input.menuItemId, isActive: input.isActive };
}

export async function deleteMenuItem(input: { restaurantId: string; menuItemId: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.menuItemId, "menuItemId");
  return prisma.$transaction(async (transaction) => {
    const item = await transaction.menuItem.findFirst({
      where: { id: input.menuItemId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!item) throw new CatalogNotFoundError("Menu item not found.");
    const orderItemCount = await transaction.orderItem.count({
      where: { menuItemId: item.id, menuItem: { restaurantId: input.restaurantId } },
    });
    const reason = menuItemDeletionBlockReason(orderItemCount);
    if (reason) throw new CatalogDeletionBlockedError(reason);
    await transaction.menuItem.deleteMany({ where: { id: item.id, restaurantId: input.restaurantId } });
    return { menuItemId: item.id, deleted: true };
  });
}
