import assert from "node:assert/strict";
import test from "node:test";

import {
  ingredientDeletionBlockReason,
  menuItemDeletionBlockReason,
} from "../deletion-policy";
import { validateIngredient, validateMenuItem } from "../validation";

test("menu validation accepts a normalized valid item", () => {
  const result = validateMenuItem({ name: "  Butter Chicken ", category: " Main Course ", price: "520.00" });
  assert.deepEqual(result, { success: true, data: { name: "Butter Chicken", category: "Main Course", price: "520.00" } });
});

test("menu validation rejects empty names and invalid prices", () => {
  const result = validateMenuItem({ name: " ", category: "Main", price: "-10" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.fieldErrors.name);
    assert.ok(result.fieldErrors.price);
  }
});

test("ingredient validation enforces units and decimal precision", () => {
  const result = validateIngredient({ name: "Chicken", unit: "grams", currentStock: "1.2345", reorderLevel: "2", costPerUnit: "285.12345" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.fieldErrors.unit);
    assert.ok(result.fieldErrors.currentStock);
    assert.ok(result.fieldErrors.costPerUnit);
  }
});

test("ingredient validation accepts zero and supported units", () => {
  assert.equal(validateIngredient({ name: "Olive Oil", unit: "litre", currentStock: "0", reorderLevel: "2.500", costPerUnit: "145.2500" }).success, true);
});

test("menu deletion policy protects historical orders", () => {
  assert.equal(menuItemDeletionBlockReason(0), null);
  assert.match(menuItemDeletionBlockReason(1) ?? "", /historical orders/i);
});

test("ingredient deletion policy protects recipes and purchase history", () => {
  assert.match(ingredientDeletionBlockReason(1, 0) ?? "", /recipes/i);
  assert.match(ingredientDeletionBlockReason(0, 1) ?? "", /purchase-order history/i);
  assert.match(ingredientDeletionBlockReason(0, 0, 1) ?? "", /movement history/i);
  assert.equal(ingredientDeletionBlockReason(0, 0), null);
});
