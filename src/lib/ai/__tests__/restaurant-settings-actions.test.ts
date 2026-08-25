import assert from "node:assert/strict";
import test from "node:test";
import { guardAIAction } from "@/lib/ai/action-guard";
import { getAIActionRegistration, getRegisteredAIActionTypes } from "@/lib/ai/action-registry";
import { validateAIApprovalRequest } from "@/lib/ai/action-request";
import { buildBrowserConversationHistory } from "@/lib/ai/history";
import { RESTAURANT_SETTINGS_PROPOSAL_TOOL, validateRestaurantSettingsProposalTool } from "@/lib/ai/restaurant-settings-proposal-tool";
import { getReadOnlyToolContractNames, validateReadOnlyToolArguments } from "@/lib/ai/tool-contracts";
import { restaurantSettingsSnapshotMatches } from "@/lib/settings/ai-policy";
import { validateSettingsInput } from "@/lib/settings/validation";

const restaurant = { id: "trusted", name: "Kitchen", timezone: "Asia/Kolkata", currency: "INR", guestCapacity: 96 };
const current = { name: "Pappi Da Dhabba", phone: null, address: null, timezone: "Asia/Kolkata", currency: "INR", guestCapacity: 96, updatedAt: new Date("2026-08-25T10:00:00.000Z") };
const snapshot = { ...current, updatedAt: current.updatedAt.toISOString() };

test("restaurant settings action is medium-risk, admin-only, and approval-required", () => {
  const registration = getAIActionRegistration("UPDATE_RESTAURANT_SETTINGS");
  assert.equal(registration?.handlerKey, "restaurant-settings");
  assert.equal(registration?.policy.riskLevel, "MEDIUM");
  assert.equal(registration?.policy.authorization, "ORGANIZATION_ADMIN");
  assert.equal(registration?.policy.humanApprovalRequired, true);
});

test("settings proposal supports every conventional editable field", () => {
  assert.deepEqual(validateRestaurantSettingsProposalTool({ action_type: "UPDATE_RESTAURANT_SETTINGS", name: "Pappi Da Dhaba", phone: "+91 98765 43210", address: "Sector 17 Chandigarh", timezone: "Asia/Kolkata", currency: "inr", guest_capacity: 120, explanation: "Update operating settings" }), { actionType: "UPDATE_RESTAURANT_SETTINGS", name: "Pappi Da Dhaba", phone: "+91 98765 43210", address: "Sector 17 Chandigarh", timezone: "Asia/Kolkata", currency: "inr", guestCapacity: 120, explanation: "Update operating settings" });
});

test("settings proposal rejects unexpected, tenant, and destructive fields", () => {
  for (const extra of [{ restaurantId: "other" }, { clerkOrganizationId: "org_other" }, { createdAt: "now" }, { deleteRestaurant: true }]) assert.throws(() => validateRestaurantSettingsProposalTool({ action_type: "UPDATE_RESTAURANT_SETTINGS", guest_capacity: 120, explanation: "Change", ...extra }));
  assert.throws(() => validateRestaurantSettingsProposalTool({ action_type: "DELETE_RESTAURANT", explanation: "Delete" }));
  assert.equal(getRegisteredAIActionTypes().some((type) => ["DELETE_RESTAURANT", "RESET_RESTAURANT", "DELETE_ORGANIZATION", "WIPE_RESTAURANT_DATA"].includes(type)), false);
});

test("conventional settings validation remains authoritative", () => {
  const base = { name: "Pappi Da Dhaba", phone: "+91 98765 43210", address: "Sector 17 Chandigarh", timezone: "Asia/Kolkata", currency: "INR", guestCapacity: "120" };
  assert.equal(validateSettingsInput(base).success, true);
  assert.equal(validateSettingsInput({ ...base, timezone: "Mars/Olympus" }).success, false);
  assert.equal(validateSettingsInput({ ...base, currency: "BTC" }).success, false);
  assert.equal(validateSettingsInput({ ...base, guestCapacity: "0" }).success, false);
  assert.equal(validateSettingsInput({ ...base, restaurantId: "other" }).success, false);
});

test("restaurant settings read tool is bounded and rejects tenant injection", () => {
  assert.ok(getReadOnlyToolContractNames().includes("get_restaurant_profile"));
  assert.deepEqual(validateReadOnlyToolArguments("get_restaurant_profile", {}, restaurant), {});
  assert.throws(() => validateReadOnlyToolArguments("get_restaurant_profile", { restaurantId: "other" }, restaurant));
  assert.equal(getReadOnlyToolContractNames().includes(RESTAURANT_SETTINGS_PROPOSAL_TOOL as never), false);
});

test("settings snapshots become stale when any editable value changes", () => {
  assert.equal(restaurantSettingsSnapshotMatches(current, snapshot), true);
  for (const changed of [{ name: "New Name" }, { phone: "+91 90000 00000" }, { address: "New address" }, { timezone: "Asia/Dubai" }, { currency: "AED" }, { guestCapacity: 120 }]) assert.equal(restaurantSettingsSnapshotMatches({ ...current, ...changed }, snapshot), false);
});

test("settings approval guard enforces tenant, expiry, authorization, rejection, and idempotency", () => {
  const base = { type: "UPDATE_RESTAURANT_SETTINGS", proposalRestaurantId: "trusted", trustedRestaurantId: "trusted", orgRole: "org:admin", status: "PENDING" as const, expiresAt: new Date("2026-08-25T12:30:00.000Z"), now: new Date("2026-08-25T12:00:00.000Z") };
  assert.equal(guardAIAction(base).kind, "ready");
  assert.equal(guardAIAction({ ...base, trustedRestaurantId: "other" }).kind, "cross-tenant");
  assert.equal(guardAIAction({ ...base, orgRole: "org:member" }).kind, "unauthorized");
  assert.equal(guardAIAction({ ...base, expiresAt: base.now }).kind, "expired");
  assert.equal(guardAIAction({ ...base, status: "REJECTED" }).kind, "unavailable");
  assert.equal(guardAIAction({ ...base, status: "EXECUTED", resultResourceId: "trusted" }).kind, "already-executed");
});

test("browser approval cannot replace restaurant identity or action type", () => {
  assert.ok(validateAIApprovalRequest({ proposalId: "proposal-1" }));
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", restaurantId: "other" }), null);
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", actionType: "UPDATE_RESTAURANT_SETTINGS" }), null);
});

test("settings proposal metadata stays outside conversation history", () => {
  const history = buildBrowserConversationHistory([{ role: "assistant", content: "I prepared a settings proposal.", actionProposal: { type: "UPDATE_RESTAURANT_SETTINGS", payload: { restaurantId: "hidden" } } } as never]);
  assert.deepEqual(history, [{ role: "assistant", content: "I prepared a settings proposal." }]);
});
