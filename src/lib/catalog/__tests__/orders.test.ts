import assert from "node:assert/strict";
import test from "node:test";

import { aggregateIngredientUsage, calculateOrderTotals, findInventoryShortages, findMissingRecipeItems } from "../../orders/calculations";
import { canTransitionOrder, getPreparationEligibility, orderResourceOwnershipError, shouldConsumeInventory, type OrderStatusValue } from "../../orders/policy";
import { commitPreparationInventory } from "../../orders/preparation";

test("order totals use trusted line prices, discount, and tax", () => {
  assert.deepEqual(calculateOrderTotals([{ menuItemId: "paneer", quantity: 2, unitPrice: "325.50" }, { menuItemId: "naan", quantity: 3, unitPrice: "55" }], "50", "38.25"), { subtotal: "816.00", discount: "50.00", tax: "38.25", total: "804.25" });
});

test("order lifecycle allows forward kitchen progress and reasonable cancellation", () => {
  assert.equal(canTransitionOrder("PENDING", "CONFIRMED"), true);
  assert.equal(canTransitionOrder("CONFIRMED", "PREPARING"), true);
  assert.equal(canTransitionOrder("PREPARING", "READY"), true);
  assert.equal(canTransitionOrder("READY", "COMPLETED"), true);
  assert.equal(canTransitionOrder("CONFIRMED", "CANCELLED"), true);
  assert.equal(canTransitionOrder("PREPARING", "CANCELLED"), true);
});

test("order lifecycle rejects invalid and terminal transitions", () => {
  assert.equal(canTransitionOrder("PENDING", "READY"), false);
  assert.equal(canTransitionOrder("COMPLETED", "CANCELLED"), false);
  assert.equal(canTransitionOrder("CANCELLED", "CONFIRMED"), false);
});

test("recipe usage multiplies per-item quantities", () => {
  const usage = aggregateIngredientUsage([{ menuItemId: "dish", menuItemName: "Paneer Tikka", ingredientId: "paneer", ingredientName: "Paneer", unit: "kg", quantityRequired: "0.250", orderQuantity: 2 }]);
  assert.equal(usage[0].required, "0.500");
});

test("recipe usage aggregates a shared ingredient across dishes", () => {
  const usage = aggregateIngredientUsage([
    { menuItemId: "one", menuItemName: "Dish One", ingredientId: "onion", ingredientName: "Onion", unit: "kg", quantityRequired: "0.100", orderQuantity: 2 },
    { menuItemId: "two", menuItemName: "Dish Two", ingredientId: "onion", ingredientName: "Onion", unit: "kg", quantityRequired: "0.150", orderQuantity: 1 },
  ]);
  assert.deepEqual(usage, [{ ingredientId: "onion", ingredientName: "Onion", unit: "kg", required: "0.350" }]);
});

test("insufficient inventory reports required, available, and shortage", () => {
  const shortages = findInventoryShortages([{ ingredientId: "paneer", ingredientName: "Paneer", unit: "kg", required: "2.500" }], [{ ingredientId: "paneer", ingredientName: "Paneer", unit: "kg", currentStock: "1.800" }]);
  assert.deepEqual(shortages[0], { ingredientId: "paneer", ingredientName: "Paneer", unit: "kg", required: "2.500", available: "1.800", shortage: "0.700" });
});

test("missing recipe detection identifies unconfigured menu items", () => {
  assert.deepEqual(findMissingRecipeItems([{ menuItemId: "one", menuItemName: "Paneer Tikka", recipeItemCount: 0 }, { menuItemId: "two", menuItemName: "Naan", recipeItemCount: 2 }]), [{ menuItemId: "one", menuItemName: "Paneer Tikka" }]);
});

test("inventory consumption is idempotently limited to the first preparing transition", () => {
  assert.equal(shouldConsumeInventory("CONFIRMED", "PREPARING", null), true);
  assert.equal(shouldConsumeInventory("CONFIRMED", "PREPARING", new Date()), false);
  assert.equal(shouldConsumeInventory("PREPARING", "PREPARING", null), false);
});

test("PENDING to CONFIRMED to PREPARING consumes inventory exactly once", async () => {
  let status: OrderStatusValue = "PENDING";
  let inventoryConsumedAt: Date | null = null;
  let stock = 10;
  assert.equal(canTransitionOrder(status, "CONFIRMED"), true);
  status = "CONFIRMED";

  const prepare = () => commitPreparationInventory({
    consumedAt: new Date("2026-08-21T12:00:00.000Z"),
    requirements: [{ ingredientId: "paneer", ingredientName: "Paneer", required: "2.000" }],
    claim: async (timestamp) => {
      if (getPreparationEligibility(status, inventoryConsumedAt) !== "ELIGIBLE") return false;
      status = "PREPARING";
      inventoryConsumedAt = timestamp;
      return true;
    },
    decrement: async (requirement) => { stock -= Number(requirement.required); return true; },
    onClaimFailed: async () => { throw new Error("already consumed"); },
    onDecrementFailed: () => { throw new Error("insufficient inventory"); },
  });

  await prepare();
  assert.equal(status, "PREPARING");
  assert.ok(inventoryConsumedAt);
  assert.equal(stock, 8);
  await assert.rejects(prepare(), /already consumed/);
  assert.equal(stock, 8);
});

test("preparation eligibility distinguishes stale clients, consumed inventory, and wrong status", () => {
  assert.equal(getPreparationEligibility("CONFIRMED", undefined), "STALE_CLIENT");
  assert.equal(getPreparationEligibility("CONFIRMED", new Date()), "ALREADY_CONSUMED");
  assert.equal(getPreparationEligibility("PENDING", null), "WRONG_STATUS");
  assert.equal(getPreparationEligibility("CONFIRMED", null), "ELIGIBLE");
});

test("order resource ownership rejects cross-tenant relationships", () => {
  assert.equal(orderResourceOwnershipError("restaurant-a", ["restaurant-a", "restaurant-a"]), null);
  assert.match(orderResourceOwnershipError("restaurant-a", ["restaurant-a", "restaurant-b"]) ?? "", /do not belong/i);
});
