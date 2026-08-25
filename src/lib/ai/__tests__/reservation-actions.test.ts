import assert from "node:assert/strict";
import test from "node:test";
import { getAIActionRegistration, getRegisteredAIActionTypes } from "@/lib/ai/action-registry";
import { validateAIApprovalRequest } from "@/lib/ai/action-request";
import { buildBrowserConversationHistory } from "@/lib/ai/history";
import { RESERVATION_PROPOSAL_TOOL, validateReservationProposalTool } from "@/lib/ai/reservation-proposal-tool";
import { getReadOnlyToolContractNames, validateReadOnlyToolArguments } from "@/lib/ai/tool-contracts";
import { reservationSnapshotMatches, resolveReservationMatch } from "@/lib/reservations/ai-policy";
import { canTransitionReservation } from "@/lib/reservations/policy";
import { validateReservation } from "@/lib/reservations/validation";

const restaurant = { id: "trusted", name: "Kitchen", timezone: "Asia/Kolkata", currency: "INR", guestCapacity: 100 };

test("reservation actions are medium-risk admin-approved proposals without delete", () => {
  for (const type of ["CREATE_RESERVATION", "UPDATE_RESERVATION", "TRANSITION_RESERVATION_STATUS"] as const) { const registration = getAIActionRegistration(type); assert.equal(registration?.handlerKey, "reservation"); assert.equal(registration?.policy.riskLevel, "MEDIUM"); assert.equal(registration?.policy.authorization, "ORGANIZATION_ADMIN"); assert.equal(registration?.policy.humanApprovalRequired, true); }
  assert.equal(getRegisteredAIActionTypes().includes("DELETE_RESERVATION" as never), false);
});

test("reservation proposal contract requires normalized local time and rejects mutation tampering", () => {
  const create = validateReservationProposalTool({ action_type: "CREATE_RESERVATION", customer_name: "Rahul", reservation_time: "2026-08-25T20:00", guest_count: 4, explanation: "Requested" });
  assert.equal(create.reservationTime, "2026-08-25T20:00"); assert.equal(create.guestCount, 4);
  assert.throws(() => validateReservationProposalTool({ action_type: "CREATE_RESERVATION", customer_name: "Rahul", reservation_time: "tomorrow at 8", guest_count: 4, explanation: "Unsafe" }));
  assert.throws(() => validateReservationProposalTool({ action_type: "DELETE_RESERVATION", customer_name: "Rahul", explanation: "Delete" }));
  assert.throws(() => validateReservationProposalTool({ action_type: "UPDATE_RESERVATION", customer_name: "Rahul", current_reservation_time: "2026-08-25T20:00", guest_count: 5, reservationId: "other", explanation: "Tamper" }));
});

test("restaurant-local validation converts time and enforces guest capacity", () => {
  const valid = validateReservation({ customerName: "Rahul", guestCount: "4", reservationTime: "2026-08-25T20:00", tableNumber: "7" }, { timezone: "Asia/Kolkata", guestCapacity: 100 });
  assert.equal(valid.success, true); if (valid.success) assert.equal(valid.data.reservationTime.toISOString(), "2026-08-25T14:30:00.000Z");
  assert.equal(validateReservation({ customerName: "Rahul", guestCount: "101", reservationTime: "2026-08-25T20:00", tableNumber: "" }, { timezone: "Asia/Kolkata", guestCapacity: 100 }).success, false);
});

test("reservation resolution is ambiguity-safe and scoped by exact local instant", () => {
  const time = new Date("2026-08-25T14:30:00.000Z"); const records = [{ id: "one", customerName: "Rahul", reservationTime: time }, { id: "two", customerName: "Rahul Sharma", reservationTime: time }];
  assert.equal(resolveReservationMatch(records, "Rahul", time).kind, "ambiguous"); assert.equal(resolveReservationMatch([records[0]], "Rahul", time).kind, "resolved"); assert.equal(resolveReservationMatch(records, "Aman", time).kind, "missing");
});

test("reservation lifecycle remains authoritative", () => {
  assert.equal(canTransitionReservation("PENDING", "CONFIRMED"), true); assert.equal(canTransitionReservation("CONFIRMED", "SEATED"), true); assert.equal(canTransitionReservation("SEATED", "COMPLETED"), true); assert.equal(canTransitionReservation("CONFIRMED", "CANCELLED"), true); assert.equal(canTransitionReservation("CONFIRMED", "NO_SHOW"), true); assert.equal(canTransitionReservation("CANCELLED", "CONFIRMED"), false); assert.equal(canTransitionReservation("COMPLETED", "CANCELLED"), false);
});

test("reservation stale-state protection detects field and status changes", () => {
  const current = { customerName: "Rahul", reservationTime: new Date("2026-08-25T14:30:00.000Z"), guestCount: 4, tableNumber: null, status: "CONFIRMED" as const, updatedAt: new Date("2026-08-24T10:00:00.000Z") };
  const snapshot = { customerName: current.customerName, reservationTime: current.reservationTime.toISOString(), guestCount: current.guestCount, tableNumber: current.tableNumber, status: current.status, updatedAt: current.updatedAt.toISOString() };
  assert.equal(reservationSnapshotMatches(current, snapshot), true); assert.equal(reservationSnapshotMatches({ ...current, guestCount: 5 }, snapshot), false); assert.equal(reservationSnapshotMatches({ ...current, status: "CANCELLED" }, snapshot), false);
});

test("reservation read tools are bounded and reject browser tenant injection", () => {
  const names = getReadOnlyToolContractNames(); for (const name of ["find_reservations", "get_reservation_details", "list_upcoming_reservations"]) assert.ok(names.includes(name as never));
  const parsed = validateReadOnlyToolArguments("find_reservations", { customer_name: "Rahul", start_date: "2026-08-25", end_date: "2026-08-25" }, restaurant) as { customerName: string; start: Date; end: Date };
  assert.equal(parsed.customerName, "Rahul"); assert.equal(parsed.start.toISOString(), "2026-08-24T18:30:00.000Z"); assert.equal(parsed.end.toISOString(), "2026-08-25T18:30:00.000Z");
  assert.throws(() => validateReadOnlyToolArguments("find_reservations", { customer_name: "Rahul", restaurantId: "other" }, restaurant)); assert.throws(() => validateReadOnlyToolArguments("list_upcoming_reservations", { start_date: "2026-08-25", end_date: "2026-08-25", limit: 51 }, restaurant)); assert.equal(names.includes(RESERVATION_PROPOSAL_TOOL as never), false);
});

test("browser approval and conversation history cannot carry reservation authority", () => {
  assert.ok(validateAIApprovalRequest({ proposalId: "proposal-1" })); assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", reservationId: "other" }), null); assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", restaurantId: "other" }), null); assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", actionType: "UPDATE_RESERVATION" }), null);
  const history = buildBrowserConversationHistory([{ role: "assistant", content: "I prepared a reservation proposal.", actionProposal: { type: "CREATE_RESERVATION", payload: { reservationId: "secret" } } } as never]); assert.deepEqual(history, [{ role: "assistant", content: "I prepared a reservation proposal." }]);
});
