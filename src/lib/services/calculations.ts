import type {
  IngredientUsageLine,
  ReservationAggregateInput,
  StockItem,
} from "@/lib/services/types";

export function sumRevenue(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function calculatePercentageChange(current: number, comparison: number) {
  if (comparison === 0) return current === 0 ? 0 : null;
  return ((current - comparison) / comparison) * 100;
}

export function isLowStock(currentStock: number, reorderLevel: number) {
  return currentStock <= reorderLevel;
}

export function filterLowStock(items: readonly StockItem[]) {
  return items
    .filter((item) => isLowStock(item.currentStock, item.reorderLevel))
    .sort(
      (a, b) =>
        a.currentStock / Math.max(a.reorderLevel, 0.001) -
        b.currentStock / Math.max(b.reorderLevel, 0.001),
    );
}

export function aggregateReservations(records: readonly ReservationAggregateInput[]) {
  const byStatus: Record<string, number> = {};
  let totalGuests = 0;

  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
    totalGuests += record.guestCount;
  }

  return { totalReservations: records.length, totalGuests, byStatus };
}

export function calculateIngredientUsage(lines: readonly IngredientUsageLine[]) {
  const usage = lines.reduce(
    (total, line) => total + line.orderItemQuantity * line.quantityRequired,
    0,
  );
  return Math.round(usage * 1_000_000) / 1_000_000;
}
