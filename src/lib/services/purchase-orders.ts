import "server-only";

import { InventoryMovementType, Prisma, PurchaseOrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateIngredientReason, purchaseOrderOwnershipError, purchaseOrderReference, purchaseOrderTransitionError, shouldApplyInventory, type PurchaseOrderStatusValue } from "@/lib/purchase-orders/policy";
import { calculatePurchaseOrderTotal, type PurchaseOrderLineFields } from "@/lib/purchase-orders/validation";
import { PurchaseOrderError } from "@/lib/services/purchase-order-errors";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";
import { applyInventoryDeltaInTransaction } from "@/lib/services/inventory-movements";

const orderInclude = {
  supplier: { select: { id: true, name: true } },
  items: { include: { ingredient: { select: { id: true, name: true, unit: true } } }, orderBy: { ingredient: { name: "asc" as const } } },
} satisfies Prisma.PurchaseOrderInclude;

type OrderPayload = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

export function serializePurchaseOrder(order: OrderPayload) {
  return {
    id: order.id,
    supplier: order.supplier,
    status: order.status,
    totalAmount: order.totalAmount.toNumber(),
    orderedAt: order.orderedAt?.toISOString() ?? null,
    expectedAt: order.expectedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({ id: item.id, ingredientId: item.ingredientId, ingredientName: item.ingredient.name, unit: item.ingredient.unit, quantity: item.quantity.toNumber(), unitCost: item.unitCost.toNumber() })),
  };
}

export function purchaseOrderSnapshot(order: ReturnType<typeof serializePurchaseOrder>) {
  return { status: order.status, supplierId: order.supplier.id, totalAmount: order.totalAmount, expectedAt: order.expectedAt, orderedAt: order.orderedAt, updatedAt: order.updatedAt, items: order.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity, unitCost: item.unitCost })).sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)) };
}

async function assertResources(transaction: Prisma.TransactionClient, restaurantId: string, supplierId: string, items: PurchaseOrderLineFields[]) {
  const duplicate = duplicateIngredientReason(items.map((item) => item.ingredientId));
  if (duplicate) throw new PurchaseOrderError(duplicate);
  if (!items.length) throw new PurchaseOrderError("Add at least one ingredient.");
  for (const item of items) {
    try {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitCost = new Prisma.Decimal(item.unitCost);
      if (!quantity.isPositive() || unitCost.isNegative() || quantity.decimalPlaces() > 3 || unitCost.decimalPlaces() > 4) throw new Error("invalid line");
    } catch {
      throw new PurchaseOrderError("Every item requires a positive quantity and a non-negative unit cost.");
    }
  }
  const [supplier, ingredients] = await Promise.all([
    transaction.supplier.findFirst({ where: { id: supplierId, restaurantId }, select: { restaurantId: true } }),
    transaction.ingredient.findMany({ where: { id: { in: items.map((item) => item.ingredientId) }, restaurantId }, select: { id: true, restaurantId: true } }),
  ]);
  if (purchaseOrderOwnershipError(restaurantId, supplier?.restaurantId ?? null) || ingredients.length !== items.length || ingredients.some((ingredient) => purchaseOrderOwnershipError(restaurantId, ingredient.restaurantId))) {
    throw new PurchaseOrderError("A selected supplier or ingredient does not belong to your restaurant.");
  }
}

export async function listPurchaseOrders(input: { restaurantId: string; status?: PurchaseOrderStatusValue }) {
  assertRestaurantId(input.restaurantId);
  const orders = await prisma.purchaseOrder.findMany({ where: { restaurantId: input.restaurantId, ...(input.status ? { status: input.status } : {}) }, include: orderInclude, orderBy: { createdAt: "desc" } });
  return orders.map(serializePurchaseOrder);
}

export async function findPurchaseOrders(input: { restaurantId: string; reference?: string; supplierName?: string; status?: PurchaseOrderStatusValue; limit?: number }) {
  assertRestaurantId(input.restaurantId);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 30);
  const normalizedReference = input.reference?.trim().toUpperCase();
  const referenceSuffix = normalizedReference?.startsWith("PO-") ? normalizedReference.slice(3).toLowerCase() : normalizedReference?.toLowerCase();
  const orders = await prisma.purchaseOrder.findMany({
    where: { restaurantId: input.restaurantId, ...(referenceSuffix ? { id: { endsWith: referenceSuffix } } : {}), ...(input.status ? { status: input.status } : {}), ...(input.supplierName ? { supplier: { name: { contains: input.supplierName, mode: "insensitive" } } } : {}) },
    include: orderInclude, orderBy: { createdAt: "desc" }, take: 30,
  });
  return orders.filter((order) => !normalizedReference || purchaseOrderReference(order.id) === normalizedReference).slice(0, limit).map(serializePurchaseOrder);
}

export type DraftInput = { restaurantId: string; supplierId: string; expectedAt: Date | null; items: PurchaseOrderLineFields[] };

export async function createPurchaseOrderInTransaction(transaction: Prisma.TransactionClient, input: DraftInput) {
  await assertResources(transaction, input.restaurantId, input.supplierId, input.items);
  const totalAmount = calculatePurchaseOrderTotal(input.items);
  return serializePurchaseOrder(await transaction.purchaseOrder.create({ data: { restaurantId: input.restaurantId, supplierId: input.supplierId, expectedAt: input.expectedAt, totalAmount, status: PurchaseOrderStatus.DRAFT, items: { create: input.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity, unitCost: item.unitCost })) } }, include: orderInclude }));
}

export async function createPurchaseOrder(input: DraftInput) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.supplierId, "supplierId");
  return prisma.$transaction((transaction) => createPurchaseOrderInTransaction(transaction, input));
}

export async function updateDraftPurchaseOrder(input: DraftInput & { purchaseOrderId: string }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.purchaseOrderId, "purchaseOrderId"); assertIdentifier(input.supplierId, "supplierId");
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, restaurantId: input.restaurantId }, select: { id: true, status: true } });
    if (!order) throw new PurchaseOrderError("Purchase order not found.");
    if (order.status !== PurchaseOrderStatus.DRAFT) throw new PurchaseOrderError("Only draft purchase orders can be edited.");
    await assertResources(transaction, input.restaurantId, input.supplierId, input.items);
    await transaction.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: order.id, purchaseOrder: { restaurantId: input.restaurantId } } });
    return serializePurchaseOrder(await transaction.purchaseOrder.update({ where: { id: order.id, restaurantId: input.restaurantId }, data: { supplierId: input.supplierId, expectedAt: input.expectedAt, totalAmount: calculatePurchaseOrderTotal(input.items), items: { create: input.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity, unitCost: item.unitCost })) } }, include: orderInclude }));
  });
}

export async function transitionPurchaseOrderInTransaction(transaction: Prisma.TransactionClient, input: { restaurantId: string; purchaseOrderId: string; to: PurchaseOrderStatusValue }) {
    const order = await transaction.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, restaurantId: input.restaurantId }, include: { items: { select: { ingredientId: true, quantity: true } } } });
    if (!order) throw new PurchaseOrderError("Purchase order not found.");
    const reason = purchaseOrderTransitionError(order.status, input.to);
    if (reason) throw new PurchaseOrderError(reason);

    const claimed = await transaction.purchaseOrder.updateMany({
      where: { id: order.id, restaurantId: input.restaurantId, status: order.status },
      data: { status: input.to, ...(input.to === "ORDERED" ? { orderedAt: new Date() } : {}) },
    });
    if (!claimed.count) throw new PurchaseOrderError("Purchase order status changed. Refresh and try again.");

    if (shouldApplyInventory(order.status, input.to)) {
      for (const item of order.items) {
        try {
          await applyInventoryDeltaInTransaction(transaction, { restaurantId: input.restaurantId, ingredientId: item.ingredientId, delta: item.quantity, type: InventoryMovementType.PURCHASE_ORDER_RECEIPT, sourceId: order.id, reason: "Purchase order received" });
        } catch (error) {
          throw new PurchaseOrderError(error instanceof Error ? error.message : "A purchase-order ingredient is no longer available.");
        }
      }
    }
    return { purchaseOrderId: order.id, status: input.to, inventoryApplied: shouldApplyInventory(order.status, input.to) };
}

export async function transitionPurchaseOrder(input: { restaurantId: string; purchaseOrderId: string; to: PurchaseOrderStatusValue }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.purchaseOrderId, "purchaseOrderId");
  return prisma.$transaction((transaction) => transitionPurchaseOrderInTransaction(transaction, input));
}

export async function deleteDraftPurchaseOrder(input: { restaurantId: string; purchaseOrderId: string }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.purchaseOrderId, "purchaseOrderId");
  const deleted = await prisma.purchaseOrder.deleteMany({ where: { id: input.purchaseOrderId, restaurantId: input.restaurantId, status: PurchaseOrderStatus.DRAFT } });
  if (!deleted.count) throw new PurchaseOrderError("Only an existing draft purchase order can be deleted.");
  return { purchaseOrderId: input.purchaseOrderId, deleted: true };
}
