import assert from "node:assert/strict";
import test from "node:test";
import { canEditReservation, canTransitionReservation, nextReservationStatuses, reservationOwnershipError, reservationTransitionError } from "../policy";
import { validateReservation, validateReservationTransition } from "../validation";

const context = { timezone: "Asia/Kolkata", guestCapacity: 96 };

test("valid reservation input is normalized for creation", () => {
  const result = validateReservation({ customerName: "  Mira Patel ", guestCount: "4", reservationTime: "2026-08-24T19:30", tableNumber: " T-4 " }, context);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.customerName, "Mira Patel");
    assert.equal(result.data.guestCount, 4);
    assert.equal(result.data.reservationTime.toISOString(), "2026-08-24T14:00:00.000Z");
    assert.equal(result.data.tableNumber, "T-4");
  }
});

test("reservation validation rejects malformed and impossible values", () => {
  const result = validateReservation({ customerName: "", guestCount: "-2", reservationTime: "not-a-date", tableNumber: "x".repeat(41) }, context);
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["customerName", "guestCount", "reservationTime", "tableNumber"]);
  assert.equal(validateReservationTransition("DELETED"), null);
});

test("a party larger than configured operational capacity is rejected", () => {
  const result = validateReservation({ customerName: "Large Party", guestCount: "97", reservationTime: "2026-08-24T19:30", tableNumber: "" }, context);
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.fieldErrors.guestCount ?? "", /capacity of 96/i);
});

test("reservation lifecycle permits only deliberate forward transitions", () => {
  assert.deepEqual(nextReservationStatuses("PENDING"), ["CONFIRMED", "CANCELLED"]);
  assert.deepEqual(nextReservationStatuses("CONFIRMED"), ["SEATED", "CANCELLED", "NO_SHOW"]);
  assert.equal(canTransitionReservation("SEATED", "COMPLETED"), true);
  assert.equal(canTransitionReservation("COMPLETED", "CONFIRMED"), false);
  assert.match(reservationTransitionError("CANCELLED", "CONFIRMED") ?? "", /cannot move/i);
  assert.equal(canEditReservation("PENDING"), true);
  assert.equal(canEditReservation("COMPLETED"), false);
});

test("reservation ownership policy rejects cross-tenant mutations", () => {
  assert.equal(reservationOwnershipError("restaurant-a", "restaurant-a"), null);
  assert.match(reservationOwnershipError("restaurant-a", "restaurant-b") ?? "", /your restaurant/i);
  assert.match(reservationOwnershipError("restaurant-a", null) ?? "", /your restaurant/i);
});
