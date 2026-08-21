import assert from "node:assert/strict";
import test from "node:test";

import { duplicateRecipeIngredientReason, recipeOwnershipError } from "../../recipes/policy";
import { validateRecipe } from "../../recipes/validation";
import { supplierDeletionBlockReason } from "../../suppliers/policy";
import { validateSupplier } from "../../suppliers/validation";

test("recipe quantity must be positive with supported precision", () => {
  assert.equal(validateRecipe({ quantityRequired: "0.125" }).success, true);
  for (const quantityRequired of ["0", "-1", "1.2345", "not-a-number"]) assert.equal(validateRecipe({ quantityRequired }).success, false);
});

test("recipe policy prevents duplicate ingredients", () => {
  assert.match(duplicateRecipeIngredientReason(true) ?? "", /already/i);
  assert.equal(duplicateRecipeIngredientReason(false), null);
});

test("recipe policy enforces cross-tenant ownership", () => {
  assert.equal(recipeOwnershipError("restaurant-a", "restaurant-a", "restaurant-a"), null);
  assert.match(recipeOwnershipError("restaurant-a", "restaurant-b", "restaurant-a") ?? "", /your restaurant/i);
  assert.match(recipeOwnershipError("restaurant-a", "restaurant-a", null) ?? "", /your restaurant/i);
});

test("supplier validation normalizes valid optional fields", () => {
  assert.deepEqual(validateSupplier({ name: "  Fresh Farms ", email: " orders@example.com ", phone: " +91 98765 43210 " }), { success: true, data: { name: "Fresh Farms", email: "orders@example.com", phone: "+91 98765 43210" } });
  assert.equal(validateSupplier({ name: "Fresh Farms", email: "", phone: "" }).success, true);
});

test("supplier validation rejects invalid email and phone", () => {
  const result = validateSupplier({ name: "A", email: "invalid", phone: "12" });
  assert.equal(result.success, false);
  if (!result.success) { assert.ok(result.fieldErrors.name); assert.ok(result.fieldErrors.email); assert.ok(result.fieldErrors.phone); }
});

test("supplier deletion policy protects purchase-order history", () => {
  assert.equal(supplierDeletionBlockReason(0), null);
  assert.match(supplierDeletionBlockReason(1) ?? "", /purchase-order history/i);
});
