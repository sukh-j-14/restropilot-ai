import "server-only";

import { randomUUID } from "node:crypto";
import { OrderStatus, Prisma } from "@/generated/prisma/client";
import { aggregateIngredientUsage, calculateOrderTotals, findInventoryShortages, findMissingRecipeItems } from "@/lib/orders/calculations";
import { getPreparationEligibility, ORDER_TYPES, orderResourceOwnershipError, orderTransitionError, type OrderStatusValue, type OrderTypeValue } from "@/lib/orders/policy";
import { commitPreparationInventory } from "@/lib/orders/preparation";
import { prisma } from "@/lib/prisma";
import { OrderWorkflowError } from "@/lib/services/order-errors";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";

const orderInclude = { items: { include: { menuItem: { select: { id: true, name: true, restaurantId: true } } }, orderBy: { id: "asc" as const } } } satisfies Prisma.OrderInclude;
type OrderPayload = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function serialize(order: OrderPayload) {
  return { id: order.id, orderNumber: order.orderNumber, status: order.status, orderType: order.orderType, subtotal: order.subtotal.toNumber(), discount: order.discount.toNumber(), tax: order.tax.toNumber(), total: order.total.toNumber(), inventoryConsumedAt: order.inventoryConsumedAt?.toISOString() ?? null, createdAt: order.createdAt.toISOString(), items: order.items.map((item) => ({ id: item.id, menuItemId: item.menuItemId, menuItemName: item.menuItem.name, quantity: item.quantity, unitPrice: item.unitPrice.toNumber(), totalPrice: item.totalPrice.toNumber() })) };
}

export async function listOrders(input: { restaurantId: string; status?: OrderStatusValue; orderType?: OrderTypeValue }) {
  assertRestaurantId(input.restaurantId);
  return (await prisma.order.findMany({ where: { restaurantId: input.restaurantId, ...(input.status ? { status: input.status } : {}), ...(input.orderType ? { orderType: input.orderType } : {}) }, include: orderInclude, orderBy: { createdAt: "desc" }, take: 250 })).map(serialize);
}

export async function listKitchenOrders(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  return (await prisma.order.findMany({ where: { restaurantId: input.restaurantId, status: { in: [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY] } }, include: orderInclude, orderBy: { createdAt: "asc" } })).map(serialize);
}

export async function listActiveMenuItemsForOrders(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  return (await prisma.menuItem.findMany({ where: { restaurantId: input.restaurantId, isActive: true }, select: { id: true, name: true, category: true, price: true }, orderBy: [{ category: "asc" }, { name: "asc" }] })).map((item) => ({ ...item, price: item.price.toNumber() }));
}

type CreateOrderInput = { restaurantId: string; orderType: OrderTypeValue; discount: string; tax: string; items: Array<{ menuItemId: string; quantity: number }> };

export async function createOrder(input: CreateOrderInput) {
  assertRestaurantId(input.restaurantId);
  if (!ORDER_TYPES.includes(input.orderType)) throw new OrderWorkflowError("Order type is invalid.");
  try {
    const discount = new Prisma.Decimal(input.discount);
    const tax = new Prisma.Decimal(input.tax);
    if (discount.isNegative() || tax.isNegative() || discount.decimalPlaces() > 2 || tax.decimalPlaces() > 2) throw new Error("invalid money");
  } catch {
    throw new OrderWorkflowError("Discount and tax must be non-negative amounts with up to 2 decimal places.");
  }
  if (!input.items.length) throw new OrderWorkflowError("Add at least one menu item.");
  const ids = input.items.map((item) => item.menuItemId);
  if (new Set(ids).size !== ids.length) throw new OrderWorkflowError("Each menu item can appear only once in an order.");
  if (input.items.some((item) => !item.menuItemId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) throw new OrderWorkflowError("Order items are invalid.");

  return prisma.$transaction(async (transaction) => {
    const menuItems = await transaction.menuItem.findMany({ where: { id: { in: ids }, restaurantId: input.restaurantId, isActive: true }, select: { id: true, price: true } });
    if (menuItems.length !== input.items.length) throw new OrderWorkflowError("One or more selected menu items are inactive or do not belong to your restaurant.");
    const prices = new Map(menuItems.map((item) => [item.id, item.price]));
    const pricedLines = input.items.map((item) => ({ ...item, unitPrice: prices.get(item.menuItemId)!.toString() }));
    const totals = calculateOrderTotals(pricedLines, input.discount, input.tax);
    if (new Prisma.Decimal(totals.discount).greaterThan(totals.subtotal)) throw new OrderWorkflowError("Discount cannot exceed the subtotal.");
    const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const order = await transaction.order.create({ data: { restaurantId: input.restaurantId, orderNumber, status: OrderStatus.PENDING, orderType: input.orderType, ...totals, items: { create: pricedLines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, unitPrice: line.unitPrice, totalPrice: new Prisma.Decimal(line.unitPrice).mul(line.quantity).toDecimalPlaces(2) })) } }, include: orderInclude });
    return serialize(order);
  });
}

function shortageMessage(shortages: ReturnType<typeof findInventoryShortages>) {
  return `Insufficient inventory: ${shortages.map((item) => `${item.ingredientName} requires ${item.required} ${item.unit}, available ${item.available} ${item.unit}, shortage ${item.shortage} ${item.unit}`).join("; ")}.`;
}

export async function transitionOrder(input: { restaurantId: string; orderId: string; to: OrderStatusValue }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.orderId, "orderId");
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, restaurantId: input.restaurantId },
      include: { items: { include: { menuItem: { include: { recipeItems: { include: { ingredient: true } } } } } } },
    });
    if (!order) throw new OrderWorkflowError("Order not found.");
    const preparationEligibility = getPreparationEligibility(order.status, order.inventoryConsumedAt);
    if (input.to === "PREPARING") {
      if (preparationEligibility === "STALE_CLIENT") throw new OrderWorkflowError("The server is using an outdated Prisma Client. Restart the development server and try again.", "STALE_CLIENT");
      if (preparationEligibility === "ALREADY_CONSUMED") throw new OrderWorkflowError("Inventory has already been consumed for this order and will not be deducted again.", "ALREADY_CONSUMED");
      if (preparationEligibility === "WRONG_STATUS") throw new OrderWorkflowError(`Order is currently ${order.status}; only a confirmed order can start preparation.`, "WRONG_STATUS");
    }
    const transitionError = orderTransitionError(order.status, input.to);
    if (transitionError) throw new OrderWorkflowError(transitionError, "WRONG_STATUS");

    if (input.to === "PREPARING") {
      const restaurantIds = order.items.flatMap((item) => [item.menuItem.restaurantId, ...item.menuItem.recipeItems.map((recipe) => recipe.ingredient.restaurantId)]);
      const ownershipError = orderResourceOwnershipError(input.restaurantId, restaurantIds);
      if (ownershipError) throw new OrderWorkflowError(ownershipError);
      const missing = findMissingRecipeItems(order.items.map((item) => ({ menuItemId: item.menuItemId, menuItemName: item.menuItem.name, recipeItemCount: item.menuItem.recipeItems.length })));
      if (missing.length) throw new OrderWorkflowError(`Recipe configuration required for: ${missing.map((item) => item.menuItemName).join(", ")}.`);
      const usage = aggregateIngredientUsage(order.items.flatMap((item) => item.menuItem.recipeItems.map((recipe) => ({ menuItemId: item.menuItemId, menuItemName: item.menuItem.name, ingredientId: recipe.ingredientId, ingredientName: recipe.ingredient.name, unit: recipe.ingredient.unit, quantityRequired: recipe.quantityRequired.toString(), orderQuantity: item.quantity }))));
      const stock = [...new Map(order.items.flatMap((item) => item.menuItem.recipeItems.map((recipe) => [recipe.ingredientId, { ingredientId: recipe.ingredientId, ingredientName: recipe.ingredient.name, unit: recipe.ingredient.unit, currentStock: recipe.ingredient.currentStock.toString() }] as const))).values()];
      const shortages = findInventoryShortages(usage, stock);
      if (shortages.length) throw new OrderWorkflowError(shortageMessage(shortages));

      const consumedAt = new Date();
      await commitPreparationInventory({
        consumedAt,
        requirements: usage,
        claim: async (timestamp) => (await transaction.order.updateMany({ where: { id: order.id, restaurantId: input.restaurantId, status: OrderStatus.CONFIRMED, inventoryConsumedAt: null }, data: { status: OrderStatus.PREPARING, inventoryConsumedAt: timestamp } })).count === 1,
        decrement: async (requirement) => (await transaction.ingredient.updateMany({ where: { id: requirement.ingredientId, restaurantId: input.restaurantId, currentStock: { gte: requirement.required } }, data: { currentStock: { decrement: requirement.required } } })).count === 1,
        onClaimFailed: async () => {
          const current = await transaction.order.findFirst({ where: { id: order.id, restaurantId: input.restaurantId }, select: { status: true, inventoryConsumedAt: true } });
          if (current?.inventoryConsumedAt) throw new OrderWorkflowError("Inventory was already consumed by another preparation request and was not deducted again.", "ALREADY_CONSUMED");
          if (current?.status !== OrderStatus.CONFIRMED) throw new OrderWorkflowError(`Another request moved the order to ${current?.status ?? "another state"}. Inventory was not deducted by this request.`, "CONCURRENT_TRANSITION");
          throw new OrderWorkflowError("Another preparation request claimed this order. Inventory was not deducted twice.", "CONCURRENT_TRANSITION");
        },
        onDecrementFailed: (requirement) => { throw new OrderWorkflowError(`Inventory changed while preparing the order. ${requirement.ingredientName} no longer has enough stock.`); },
      });
      return { orderId: order.id, status: input.to, inventoryConsumed: true, inventoryConsumedAt: consumedAt.toISOString() };
    }

    const updated = await transaction.order.updateMany({ where: { id: order.id, restaurantId: input.restaurantId, status: order.status }, data: { status: input.to } });
    if (!updated.count) throw new OrderWorkflowError("Order status changed. Refresh and try again.");
    return { orderId: order.id, status: input.to, inventoryConsumed: false, inventoryConsumedAt: order.inventoryConsumedAt?.toISOString() ?? null };
  });
}
