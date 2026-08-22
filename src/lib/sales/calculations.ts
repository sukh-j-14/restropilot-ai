export type SalesRankingItem = {
  menuItemId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
};

export function calculateAverageOrderValue(revenue: number, completedOrders: number) {
  return completedOrders > 0 ? revenue / completedOrders : 0;
}

export function rankSalesItems(
  items: SalesRankingItem[],
  rankBy: "revenue" | "quantity",
  limit: number,
) {
  return [...items]
    .sort((a, b) => b[rankBy] - a[rankBy] || b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function fillDailyRevenue(
  startKey: string,
  endKey: string,
  values: Array<{ date: string; revenue: number }>,
  addDays: (key: string, amount: number) => string,
) {
  const byDate = new Map(values.map((value) => [value.date, value.revenue]));
  const result: Array<{ date: string; revenue: number }> = [];
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    result.push({ date: key, revenue: byDate.get(key) ?? 0 });
  }
  return result;
}

export function normalizeOrderTypeBreakdown(
  values: Array<{ orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY"; orderCount: number; revenue: number }>,
) {
  const types = ["DINE_IN", "TAKEAWAY", "DELIVERY"] as const;
  const byType = new Map(values.map((value) => [value.orderType, value]));
  const totalRevenue = values.reduce((sum, value) => sum + value.revenue, 0);
  const totalOrders = values.reduce((sum, value) => sum + value.orderCount, 0);
  return types.map((orderType) => {
    const value = byType.get(orderType);
    const revenue = value?.revenue ?? 0;
    const orderCount = value?.orderCount ?? 0;
    return {
      orderType,
      revenue,
      orderCount,
      revenueShare: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      orderShare: totalOrders > 0 ? (orderCount / totalOrders) * 100 : 0,
    };
  });
}
