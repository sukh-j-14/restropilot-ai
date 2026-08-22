import assert from "node:assert/strict";
import test from "node:test";
import { addDays } from "../../dashboard/date";
import { calculateAverageOrderValue, fillDailyRevenue, normalizeOrderTypeBreakdown, rankSalesItems } from "../calculations";
import { resolveSalesRange } from "../ranges";

test("date ranges use the restaurant timezone at a UTC date boundary", () => {
  const range = resolveSalesRange({ timeZone: "Asia/Kolkata", preset: "today", now: new Date("2026-08-21T20:00:00Z") });
  assert.equal(range.startKey, "2026-08-22");
  assert.equal(range.endKey, "2026-08-22");
  assert.equal(range.comparisonStartKey, "2026-08-21");
  assert.equal(range.start.toISOString(), "2026-08-21T18:30:00.000Z");
});

test("last seven days compares with the immediately preceding seven days", () => {
  const range = resolveSalesRange({ timeZone: "UTC", preset: "last7", now: new Date("2026-08-22T12:00:00Z") });
  assert.equal(range.startKey, "2026-08-16");
  assert.equal(range.endKey, "2026-08-22");
  assert.equal(range.comparisonStartKey, "2026-08-09");
  assert.equal(range.comparisonEndKey, "2026-08-15");
  assert.equal(range.dayCount, 7);
});

test("custom ranges reject malformed, reversed, and excessive dates", () => {
  for (const input of [
    { start: "not-a-date", end: "2026-08-22" },
    { start: "2026-08-23", end: "2026-08-22" },
    { start: "2024-01-01", end: "2026-08-22" },
  ]) {
    assert.ok(resolveSalesRange({ timeZone: "UTC", preset: "custom", ...input }).error);
  }
});

test("average order value is safe for empty periods", () => {
  assert.equal(calculateAverageOrderValue(2100, 3), 700);
  assert.equal(calculateAverageOrderValue(0, 0), 0);
});

test("daily revenue fills missing restaurant-local days with zero", () => {
  assert.deepEqual(fillDailyRevenue("2026-08-20", "2026-08-22", [{ date: "2026-08-21", revenue: 700 }], addDays), [
    { date: "2026-08-20", revenue: 0 },
    { date: "2026-08-21", revenue: 700 },
    { date: "2026-08-22", revenue: 0 },
  ]);
});

test("top-selling items support revenue and quantity ranking", () => {
  const items = [
    { menuItemId: "a", name: "A", category: "Main", quantity: 10, revenue: 1000 },
    { menuItemId: "b", name: "B", category: "Main", quantity: 20, revenue: 800 },
  ];
  assert.equal(rankSalesItems(items, "revenue", 10)[0].menuItemId, "a");
  assert.equal(rankSalesItems(items, "quantity", 10)[0].menuItemId, "b");
  assert.deepEqual(items.map((item) => item.menuItemId), ["a", "b"]);
});

test("order type aggregation zero-fills absent types and calculates shares", () => {
  const result = normalizeOrderTypeBreakdown([{ orderType: "DINE_IN", orderCount: 2, revenue: 800 }]);
  assert.deepEqual(result.map((item) => item.orderType), ["DINE_IN", "TAKEAWAY", "DELIVERY"]);
  assert.equal(result[0].revenueShare, 100);
  assert.equal(result[1].revenue, 0);
  assert.equal(result[2].orderCount, 0);
});
