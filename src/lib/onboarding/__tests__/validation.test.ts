import assert from "node:assert/strict";
import test from "node:test";

import { validateOnboardingInput } from "../validation";

const validInput = {
  name: "Harbour Table",
  timezone: "Asia/Kolkata",
  currency: "INR",
  phone: "+91 98765 43210",
  address: "12 Market Road",
  guestCapacity: "120",
};

test("onboarding validation normalizes valid restaurant input", () => {
  const result = validateOnboardingInput(validInput);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Harbour Table");
    assert.equal(result.data.currency, "INR");
    assert.equal(result.data.guestCapacity, 120);
  }
});

test("optional onboarding fields become null", () => {
  const result = validateOnboardingInput({ ...validInput, phone: "", address: "" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.phone, null);
    assert.equal(result.data.address, null);
  }
});

test("onboarding validation rejects unsupported and unsafe values", () => {
  const result = validateOnboardingInput({
    ...validInput,
    timezone: "Invalid/Zone",
    currency: "XYZ",
    guestCapacity: "0",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.fieldErrors.timezone);
    assert.ok(result.fieldErrors.currency);
    assert.ok(result.fieldErrors.guestCapacity);
  }
});
