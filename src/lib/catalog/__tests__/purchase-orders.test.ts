import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionPurchaseOrder, duplicateIngredientReason, purchaseOrderOwnershipError, shouldApplyInventory } from "../../purchase-orders/policy";
import { calculatePurchaseOrderTotal, validatePurchaseOrder } from "../../purchase-orders/validation";
import {
  calculateEffectiveStock,
  hasConflictingOpenPurchaseOrder,
  isOpenIncomingPurchaseOrderStatus,
  shouldProposePurchaseOrder,
} from "../../purchase-orders/incoming-policy";

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

test("only genuinely open purchase orders count as incoming stock", () => {
  assert.equal(isOpenIncomingPurchaseOrderStatus("DRAFT"), true);
  assert.equal(isOpenIncomingPurchaseOrderStatus("ORDERED"), true);
  assert.equal(isOpenIncomingPurchaseOrderStatus("PARTIALLY_RECEIVED"), true);
  assert.equal(isOpenIncomingPurchaseOrderStatus("RECEIVED"), false);
  assert.equal(isOpenIncomingPurchaseOrderStatus("CANCELLED"), false);
  assert.equal(hasConflictingOpenPurchaseOrder([{ status: "RECEIVED", quantity: 15 }]), false);
  assert.equal(hasConflictingOpenPurchaseOrder([{ status: "CANCELLED", quantity: 15 }]), false);
});

test("draft and ordered ingredient lines are detected as conflicts", () => {
  assert.equal(hasConflictingOpenPurchaseOrder([{ status: "DRAFT", quantity: 10 }]), true);
  assert.equal(hasConflictingOpenPurchaseOrder([{ status: "ORDERED", quantity: 15 }]), true);
  assert.equal(hasConflictingOpenPurchaseOrder([{ status: "PARTIALLY_RECEIVED", quantity: 2 }]), true);
});

test("effective stock includes open incoming quantity", () => {
  assert.equal(calculateEffectiveStock(3, 15), 18);
  assert.deepEqual(
    shouldProposePurchaseOrder({
      currentStock: 3,
      reorderLevel: 10,
      purchaseOrders: [{ status: "ORDERED", quantity: 15 }],
    }),
    {
      incomingQuantity: 15,
      effectiveStock: 18,
      hasOpenIncoming: true,
      shouldPropose: false,
    },
  );
});

test("received history does not suppress a justified replenishment proposal", () => {
  const decision = shouldProposePurchaseOrder({
    currentStock: 3,
    reorderLevel: 10,
    purchaseOrders: [{ status: "RECEIVED", quantity: 15 }],
  });
  assert.equal(decision.incomingQuantity, 0);
  assert.equal(decision.effectiveStock, 3);
  assert.equal(decision.shouldPropose, true);
});
