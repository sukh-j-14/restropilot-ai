import assert from "node:assert/strict";
import test from "node:test";
import { canManageRestaurantSettings } from "../authorization";
import { validateSettingsInput } from "../validation";

const valid = {
  name: "Harbour Table",
  phone: "+91 98765 43210",
  address: "12 Market Road",
  timezone: "Asia/Kolkata",
  currency: "INR",
  guestCapacity: "120",
};

test("valid settings update normalizes values used by restaurant service writes", () => {
  const result = validateSettingsInput({ ...valid, name: "  Harbour Table  ", currency: "inr" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, {
      name: "Harbour Table",
      phone: "+91 98765 43210",
      address: "12 Market Road",
      timezone: "Asia/Kolkata",
      currency: "INR",
      guestCapacity: 120,
    });
  }
});

test("settings validation rejects an invalid name", () => {
  const result = validateSettingsInput({ ...valid, name: " " });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.fieldErrors.name);
});

test("settings validation rejects unsupported timezone and currency", () => {
  const result = validateSettingsInput({ ...valid, timezone: "Mars/Olympus", currency: "BTC" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.fieldErrors.timezone);
    assert.ok(result.fieldErrors.currency);
  }
});

test("settings validation rejects malformed or out-of-range capacity", () => {
  for (const guestCapacity of ["", "1.5", "0", "2001", "not-a-number"]) {
    const result = validateSettingsInput({ ...valid, guestCapacity });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.fieldErrors.guestCapacity);
  }
});

test("unexpected and browser-provided tenant fields are rejected", () => {
  const result = validateSettingsInput({ ...valid, restaurantId: "another-tenant" });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.fieldErrors.form);
});

test("only Clerk organization administrators may manage settings", () => {
  assert.equal(canManageRestaurantSettings("org:admin"), true);
  assert.equal(canManageRestaurantSettings("org:member"), false);
  assert.equal(canManageRestaurantSettings(null), false);
  assert.equal(canManageRestaurantSettings(undefined), false);
});
