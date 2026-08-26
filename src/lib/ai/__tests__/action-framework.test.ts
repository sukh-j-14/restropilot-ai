import assert from "node:assert/strict";
import test from "node:test";
import { guardAIAction } from "@/lib/ai/action-guard";
import { getAIActionRegistration, getRegisteredAIActionTypes } from "@/lib/ai/action-registry";
import { validateAIApprovalRequest } from "@/lib/ai/action-request";
import { AI_ACTION_POLICIES, isAuthorizedForAction } from "@/lib/ai/action-policy";
import { buildBrowserConversationHistory } from "@/lib/ai/history";
import { mergeProposalStatus } from "@/lib/ai/action-lifecycle";

const now = new Date("2026-08-24T12:00:00.000Z");
const base = { type: "CREATE_PURCHASE_ORDER_DRAFT", proposalRestaurantId: "restaurant-a", trustedRestaurantId: "restaurant-a", orgRole: "org:admin", status: "PENDING" as const, expiresAt: new Date("2026-08-24T12:30:00.000Z"), now };

test("the action registry exposes only explicitly supported actions", () => {
  assert.equal(getRegisteredAIActionTypes().length, 20);
  assert.equal(getAIActionRegistration("CREATE_PURCHASE_ORDER_DRAFT")?.handlerKey, "purchase-order-draft");
  assert.equal(getAIActionRegistration("CREATE_MENU_ITEM")?.handlerKey, "menu-recipe");
  assert.equal(getAIActionRegistration("run_sql"), null);
});

test("risk and authorization policy are server-owned", () => {
  const policy = AI_ACTION_POLICIES.CREATE_PURCHASE_ORDER_DRAFT;
  assert.deepEqual({ risk: policy.riskLevel, approval: policy.humanApprovalRequired, confirmation: policy.confirmationRequired }, { risk: "MEDIUM", approval: true, confirmation: true });
  assert.equal(isAuthorizedForAction(policy, "org:admin"), true);
  assert.equal(isAuthorizedForAction(policy, "org:member"), false);
});

test("generic approval guard accepts only registered, current, tenant-scoped proposals", () => {
  assert.equal(guardAIAction(base).kind, "ready");
  assert.equal(guardAIAction({ ...base, type: "DELETE_MENU_ITEM" }).kind, "unregistered");
  assert.equal(guardAIAction({ ...base, trustedRestaurantId: "restaurant-b" }).kind, "cross-tenant");
  assert.equal(guardAIAction({ ...base, orgRole: "org:member" }).kind, "unauthorized");
  assert.equal(guardAIAction({ ...base, expiresAt: now }).kind, "expired");
});

test("generic lifecycle makes rejection terminal and execution idempotent", () => {
  assert.equal(guardAIAction({ ...base, status: "REJECTED" }).kind, "unavailable");
  const repeated = guardAIAction({ ...base, status: "EXECUTED", resultResourceId: "purchase-order-1" });
  assert.deepEqual(repeated.kind === "already-executed" ? repeated.resultResourceId : null, "purchase-order-1");
});

test("stale proposal metadata cannot resurrect terminal lifecycle state", () => {
  for (const terminal of ["EXECUTED", "REJECTED", "EXPIRED", "FAILED"] as const) assert.equal(mergeProposalStatus(terminal, "PENDING"), terminal);
  assert.equal(mergeProposalStatus("APPROVED", "PENDING"), "APPROVED");
  assert.equal(mergeProposalStatus("PENDING", "EXECUTED"), "EXECUTED");
});

test("browser approval tampering and unexpected action selectors are rejected", () => {
  assert.ok(validateAIApprovalRequest({ proposalId: "proposal-1", quantities: ["10"], unitCosts: ["90"] }));
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", actionType: "CREATE_MENU_ITEM" }), null);
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", restaurantId: "restaurant-b" }), null);
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", quantities: [10] }), null);
});

test("proposal metadata remains outside browser conversation history", () => {
  const history = buildBrowserConversationHistory([{ role: "user", content: "Replenish Paneer" }, { role: "assistant", content: "Review this recommendation.", actionProposal: { type: "CREATE_PURCHASE_ORDER_DRAFT", payload: { supplierId: "hidden" } } }]);
  assert.deepEqual(history, [{ role: "user", content: "Replenish Paneer" }, { role: "assistant", content: "Review this recommendation." }]);
});
