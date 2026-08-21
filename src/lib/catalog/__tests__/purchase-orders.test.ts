import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionPurchaseOrder, duplicateIngredientReason, purchaseOrderOwnershipError, shouldApplyInventory } from "../../purchase-orders/policy";
import { calculatePurchaseOrderTotal, validatePurchaseOrder } from "../../purchase-orders/validation";

test("purchase order total is calculated from quantity and unit cost", () => {
  assert.equal(calculatePurchaseOrderTotal([{ ingredientId: "a", quantity: "2.500", unitCost: "120.40" }, { ingredientId: "b", quantity: "3", unitCost: "10" }]), "331.00");
});

test("purchase order status lifecycle accepts only supported transitions", () => {
  assert.equal(canTransitionPurchaseOrder("DRAFT", "ORDERED"), true);
  assert.equal(canTransitionPurchaseOrder("ORDERED", "RECEIVED"), true);
  assert.equal(canTransitionPurchaseOrder("PARTIALLY_RECEIVED", "RECEIVED"), true);
  assert.equal(canTransitionPurchaseOrder("RECEIVED", "ORDERED"), false);
  assert.equal(canTransitionPurchaseOrder("CANCELLED", "RECEIVED"), false);
  assert.equal(canTransitionPurchaseOrder("PARTIALLY_RECEIVED", "CANCELLED"), false);
});

test("purchase order validation prevents duplicate ingredient lines", () => {
  assert.match(duplicateIngredientReason(["one", "one"]) ?? "", /only once/i);
  const result = validatePurchaseOrder({ supplierId: "supplier", expectedAt: "2026-08-31", items: [{ ingredientId: "one", quantity: "1", unitCost: "2" }, { ingredientId: "one", quantity: "2", unitCost: "3" }] });
  assert.equal(result.success, false);
});

test("purchase order validation rejects invalid quantities, costs, and dates", () => {
  const result = validatePurchaseOrder({ supplierId: "supplier", expectedAt: "2026-02-30", items: [{ ingredientId: "one", quantity: "0", unitCost: "-1" }] });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.errors.length >= 3);
});

test("purchase order ownership policy rejects cross-tenant resources", () => {
  assert.equal(purchaseOrderOwnershipError("restaurant-a", "restaurant-a"), null);
  assert.match(purchaseOrderOwnershipError("restaurant-a", "restaurant-b") ?? "", /your restaurant/i);
  assert.match(purchaseOrderOwnershipError("restaurant-a", null) ?? "", /your restaurant/i);
});

test("inventory receiving is applied exactly on the transition into received", () => {
  assert.equal(shouldApplyInventory("ORDERED", "RECEIVED"), true);
  assert.equal(shouldApplyInventory("PARTIALLY_RECEIVED", "RECEIVED"), true);
  assert.equal(shouldApplyInventory("RECEIVED", "RECEIVED"), false);
  assert.equal(canTransitionPurchaseOrder("RECEIVED", "RECEIVED"), false);
});
