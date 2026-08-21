import "server-only";

import { OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getZonedDateParts, dateKey } from "@/lib/dashboard/date";
import {
  calculatePercentageChange,
} from "@/lib/services/calculations";
import { getRestaurantById } from "@/lib/services/restaurant";
import type { DateRangeInput, SerializableDateRange } from "@/lib/services/types";
import { assertDateRange, assertLimit } from "@/lib/services/validation";

function serializableRange(input: DateRangeInput): SerializableDateRange {
  return { start: input.start.toISOString(), end: input.end.toISOString() };
}

export async function getRevenue(input: DateRangeInput) {
  assertDateRange(input);
  const result = await prisma.order.aggregate({
    where: {
      restaurantId: input.restaurantId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: input.start, lt: input.end },
    },
    _sum: { total: true },
    _count: true,
  });

  return {
    restaurantId: input.restaurantId,
    range: serializableRange(input),
    revenue: result._sum.total?.toNumber() ?? 0,
    completedOrderCount: result._count,
  };
}

export async function getOrderSummary(input: DateRangeInput) {
  assertDateRange(input);
  const groups = await prisma.order.groupBy({
    by: ["status"],
    where: { restaurantId: input.restaurantId, createdAt: { gte: input.start, lt: input.end } },
    _count: true,
    _sum: { total: true },
  });

  const byStatus = Object.fromEntries(
    groups.map((group) => [group.status, group._count]),
  ) as Partial<Record<OrderStatus, number>>;
  const completed = groups.find((group) => group.status === OrderStatus.COMPLETED);
  const totalOrders = groups.reduce((sum, group) => sum + group._count, 0);
  const cancelledOrders = byStatus.CANCELLED ?? 0;
  const completedRevenue = completed?._sum.total?.toNumber() ?? 0;
  const completedOrders = byStatus.COMPLETED ?? 0;

  return {
    restaurantId: input.restaurantId,
    range: serializableRange(input),
    totalOrders,
    nonCancelledOrders: totalOrders - cancelledOrders,
    completedOrders,
    cancelledOrders,
    completedRevenue,
    averageCompletedOrderValue: completedOrders ? completedRevenue / completedOrders : 0,
    byStatus,
  };
}

export async function compareRevenue(input: {
  restaurantId: string;
  currentStart: Date;
  currentEnd: Date;
  comparisonStart: Date;
  comparisonEnd: Date;
}) {
  const currentInput = { restaurantId: input.restaurantId, start: input.currentStart, end: input.currentEnd };
  const comparisonInput = { restaurantId: input.restaurantId, start: input.comparisonStart, end: input.comparisonEnd };
  assertDateRange(currentInput);
  assertDateRange(comparisonInput);
  const [current, comparison] = await Promise.all([
    getRevenue(currentInput),
    getRevenue(comparisonInput),
  ]);

  return {
    restaurantId: input.restaurantId,
    current,
    comparison,
    absoluteChange: current.revenue - comparison.revenue,
    percentageChange: calculatePercentageChange(current.revenue, comparison.revenue),
  };
}

export async function getTopSellingItems(input: DateRangeInput & {
  limit?: number;
  rankBy?: "revenue" | "quantity";
}) {
  assertDateRange(input);
  const limit = input.limit ?? 10;
  const rankBy = input.rankBy ?? "revenue";
  assertLimit(limit);
  const grouped = await prisma.orderItem.groupBy({
    by: ["menuItemId"],
    where: {
      order: {
        restaurantId: input.restaurantId,
        status: OrderStatus.COMPLETED,
        createdAt: { gte: input.start, lt: input.end },
      },
    },
    _sum: { quantity: true, totalPrice: true },
  });
  const menuItems = await prisma.menuItem.findMany({
    where: {
      restaurantId: input.restaurantId,
      id: { in: grouped.map((item) => item.menuItemId) },
    },
    select: { id: true, name: true, category: true },
  });
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  return grouped
    .map((item) => ({
      menuItemId: item.menuItemId,
      name: menuById.get(item.menuItemId)?.name ?? "Unknown item",
      category: menuById.get(item.menuItemId)?.category ?? "Unknown",
      quantity: item._sum.quantity ?? 0,
      revenue: item._sum.totalPrice?.toNumber() ?? 0,
    }))
    .sort((a, b) => b[rankBy] - a[rankBy])
    .slice(0, limit);
}

export async function getSalesByHour(input: DateRangeInput) {
  assertDateRange(input);
  const restaurant = await getRestaurantById(input.restaurantId);
  if (!restaurant) return [];
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: input.restaurantId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: input.start, lt: input.end },
    },
    select: { total: true, createdAt: true },
  });
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, orderCount: 0 }));

  for (const order of orders) {
    const hour = getZonedDateParts(order.createdAt, restaurant.timezone).hour;
    hours[hour].revenue += order.total.toNumber();
    hours[hour].orderCount += 1;
  }
  return hours;
}

export async function getDailyRevenue(input: DateRangeInput & { timeZone: string }) {
  assertDateRange(input);
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: input.restaurantId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: input.start, lt: input.end },
    },
    select: { total: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const totals = new Map<string, number>();
  for (const order of orders) {
    const key = dateKey(getZonedDateParts(order.createdAt, input.timeZone));
    totals.set(key, (totals.get(key) ?? 0) + order.total.toNumber());
  }
  return Array.from(totals, ([date, revenue]) => ({ date, revenue }));
}
