import "server-only";
import { InventoryMovementType, Prisma } from "@/generated/prisma/client";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";

export async function recordInventoryMovement(transaction: Prisma.TransactionClient, input: { restaurantId: string; ingredientId: string; type: InventoryMovementType; quantityDelta: Prisma.Decimal | string | number; stockBefore: Prisma.Decimal | string | number; stockAfter: Prisma.Decimal | string | number; reason?: string | null; sourceId?: string | null; createdByClerkUserId?: string | null }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.ingredientId, "ingredientId");
  return transaction.inventoryMovement.create({ data: { restaurantId: input.restaurantId, ingredientId: input.ingredientId, type: input.type, quantityDelta: input.quantityDelta, stockBefore: input.stockBefore, stockAfter: input.stockAfter, reason: input.reason?.trim().slice(0, 300) || null, sourceId: input.sourceId ?? null, createdByClerkUserId: input.createdByClerkUserId ?? null } });
}

export async function applyInventoryDeltaInTransaction(transaction: Prisma.TransactionClient, input: { restaurantId: string; ingredientId: string; delta: Prisma.Decimal | string | number; type: InventoryMovementType; reason?: string | null; sourceId?: string | null; createdByClerkUserId?: string | null }) {
  const delta = new Prisma.Decimal(input.delta);
  if (!delta.isFinite() || delta.isZero() || delta.decimalPlaces() > 3) throw new Error("Inventory adjustment must be non-zero with up to 3 decimal places.");
  const ingredient = await transaction.ingredient.findFirst({ where: { id: input.ingredientId, restaurantId: input.restaurantId }, select: { id: true, currentStock: true } });
  if (!ingredient) throw new Error("Ingredient not found.");
  const stockAfter = ingredient.currentStock.add(delta);
  if (stockAfter.isNegative()) throw new Error("This adjustment would make inventory negative.");
  const updated = await transaction.ingredient.updateMany({ where: { id: ingredient.id, restaurantId: input.restaurantId, currentStock: ingredient.currentStock }, data: { currentStock: stockAfter } });
  if (!updated.count) throw new Error("Inventory changed while this adjustment was being applied. Try again.");
  const movement = await recordInventoryMovement(transaction, { restaurantId: input.restaurantId, ingredientId: input.ingredientId, type: input.type, quantityDelta: delta, stockBefore: ingredient.currentStock, stockAfter, reason: input.reason, sourceId: input.sourceId, createdByClerkUserId: input.createdByClerkUserId });
  return { ingredientId: ingredient.id, movementId: movement.id, stockBefore: ingredient.currentStock.toNumber(), stockAfter: stockAfter.toNumber(), delta: delta.toNumber() };
}
