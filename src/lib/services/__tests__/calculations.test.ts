import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateReservations,
  calculateIngredientUsage,
  calculatePercentageChange,
  filterLowStock,
  sumRevenue,
} from "../calculations";

test("revenue sums completed-order values", () => {
  assert.equal(sumRevenue([1200, 850.5, 449.5]), 2500);
});

test("comparison percentage handles growth, decline, and zero baseline", () => {
  assert.equal(calculatePercentageChange(120, 100), 20);
  assert.equal(calculatePercentageChange(75, 100), -25);
  assert.equal(calculatePercentageChange(0, 0), 0);
  assert.equal(calculatePercentageChange(100, 0), null);
});

test("low stock includes equality and sorts by urgency", () => {
  const lowStock = filterLowStock([
    { ingredientId: "paneer", name: "Paneer", unit: "kg", currentStock: 20, reorderLevel: 20, costPerUnit: 390, isLowStock: true },
    { ingredientId: "rice", name: "Rice", unit: "kg", currentStock: 50, reorderLevel: 20, costPerUnit: 125, isLowStock: false },
    { ingredientId: "chicken", name: "Chicken", unit: "kg", currentStock: 10, reorderLevel: 25, costPerUnit: 285, isLowStock: true },
  ]);
  assert.deepEqual(lowStock.map((item) => item.ingredientId), ["chicken", "paneer"]);
});

test("reservation aggregation totals statuses and guests", () => {
  assert.deepEqual(
    aggregateReservations([
      { status: "CONFIRMED", guestCount: 4 },
      { status: "CONFIRMED", guestCount: 2 },
      { status: "CANCELLED", guestCount: 3 },
    ]),
    { totalReservations: 3, totalGuests: 9, byStatus: { CONFIRMED: 2, CANCELLED: 1 } },
  );
});

test("ingredient usage multiplies recipe quantity by sold quantity", () => {
  assert.equal(
    calculateIngredientUsage([
      { orderItemQuantity: 3, quantityRequired: 0.28 },
      { orderItemQuantity: 2, quantityRequired: 0.2 },
    ]),
    1.24,
  );
});
