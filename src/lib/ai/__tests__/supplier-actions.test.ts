import assert from "node:assert/strict";
import test from "node:test";
import { getAIActionRegistration, getRegisteredAIActionTypes } from "@/lib/ai/action-registry";
import { validateAIApprovalRequest } from "@/lib/ai/action-request";
import { SUPPLIER_PROPOSAL_TOOL, validateSupplierProposalTool } from "@/lib/ai/supplier-proposal-tool";
import { getReadOnlyToolContractNames, validateReadOnlyToolArguments } from "@/lib/ai/tool-contracts";
import { buildBrowserConversationHistory } from "@/lib/ai/history";
import { resolveSupplierMatch, supplierSnapshotMatches } from "@/lib/suppliers/ai-policy";
import { validateSupplier } from "@/lib/suppliers/validation";

const restaurant = { id: "trusted", name: "Kitchen", timezone: "Asia/Kolkata", currency: "INR", guestCapacity: 100 };

test("supplier actions are registered as medium-risk admin-approved proposals", () => {
  for (const type of ["CREATE_SUPPLIER", "UPDATE_SUPPLIER"] as const) {
    const registration = getAIActionRegistration(type);
    assert.equal(registration?.handlerKey, "supplier");
    assert.equal(registration?.policy.riskLevel, "MEDIUM");
    assert.equal(registration?.policy.authorization, "ORGANIZATION_ADMIN");
    assert.equal(registration?.policy.humanApprovalRequired, true);
  }
  assert.equal(getRegisteredAIActionTypes().includes("DELETE_SUPPLIER" as never), false);
});

test("supplier proposal contract accepts only create and update fields", () => {
  assert.deepEqual(validateSupplierProposalTool({ action_type: "CREATE_SUPPLIER", supplier_name: "Amrit Dairy", email: "orders@amritdairy.example", phone: "+91 98765 43210", explanation: "Requested" }), { actionType: "CREATE_SUPPLIER", supplierName: "Amrit Dairy", name: undefined, email: "orders@amritdairy.example", phone: "+91 98765 43210", explanation: "Requested" });
  assert.equal(validateSupplierProposalTool({ action_type: "UPDATE_SUPPLIER", supplier_name: "Amrit Dairy", email: "new@amritdairy.example", explanation: "Update contact" }).email, "new@amritdairy.example");
  assert.throws(() => validateSupplierProposalTool({ action_type: "DELETE_SUPPLIER", supplier_name: "Amrit Dairy", explanation: "Delete" }));
  assert.throws(() => validateSupplierProposalTool({ action_type: "UPDATE_SUPPLIER", supplier_name: "Amrit Dairy", supplierId: "other", explanation: "Tamper" }));
});

test("existing supplier validation enforces email and phone formats", () => {
  assert.equal(validateSupplier({ name: "Amrit Dairy", email: "orders@amritdairy.example", phone: "+91 98765 43210" }).success, true);
  assert.equal(validateSupplier({ name: "Amrit Dairy", email: "invalid", phone: "+91 98765 43210" }).success, false);
  assert.equal(validateSupplier({ name: "Amrit Dairy", email: "orders@amritdairy.example", phone: "12" }).success, false);
});

test("supplier matching resolves exact names and reports ambiguous partial names", () => {
  const suppliers = [{ id: "one", name: "Fresh Foods Punjab" }, { id: "two", name: "Fresh Foods Wholesale" }, { id: "three", name: "Amrit Dairy" }];
  assert.deepEqual(resolveSupplierMatch(suppliers, "amrit dairy"), { kind: "resolved", supplier: suppliers[2] });
  assert.equal(resolveSupplierMatch(suppliers, "Fresh Foods").kind, "ambiguous");
  assert.equal(resolveSupplierMatch(suppliers, "Unknown").kind, "missing");
});

test("supplier stale-state protection includes contacts and updated timestamp", () => {
  const current = { name: "Amrit Dairy", email: "orders@amritdairy.example", phone: null, updatedAt: new Date("2026-08-24T10:00:00.000Z") };
  const snapshot = { name: current.name, email: current.email, phone: current.phone, updatedAt: current.updatedAt.toISOString() };
  assert.equal(supplierSnapshotMatches(current, snapshot), true);
  assert.equal(supplierSnapshotMatches({ ...current, phone: "+91 98765 43210" }, snapshot), false);
});

test("supplier read tools reject tenant injection", () => {
  const names = getReadOnlyToolContractNames();
  for (const name of ["list_suppliers", "find_suppliers", "get_supplier_details", "get_supplier_purchase_history", "find_suppliers_for_ingredient"]) assert.ok(names.includes(name as never));
  assert.deepEqual(validateReadOnlyToolArguments("get_supplier_purchase_history", { supplier_name: "Amrit Dairy" }, restaurant), { supplierName: "Amrit Dairy" });
  assert.deepEqual(validateReadOnlyToolArguments("find_suppliers_for_ingredient", { ingredient_name: "Paneer" }, restaurant), { ingredientName: "Paneer" });
  assert.throws(() => validateReadOnlyToolArguments("find_suppliers", { name: "Amrit", restaurantId: "other" }, restaurant));
  assert.equal(names.includes(SUPPLIER_PROPOSAL_TOOL as never), false);
});

test("browser approval cannot tamper with supplier identity or action type", () => {
  assert.ok(validateAIApprovalRequest({ proposalId: "proposal-1" }));
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", supplierId: "other" }), null);
  assert.equal(validateAIApprovalRequest({ proposalId: "proposal-1", actionType: "UPDATE_SUPPLIER" }), null);
});

test("supplier proposal metadata remains outside browser conversation history", () => {
  const history = buildBrowserConversationHistory([{ role: "assistant", content: "I prepared a supplier update.", actionProposal: { type: "UPDATE_SUPPLIER", payload: { supplierId: "secret" } } } as never]);
  assert.deepEqual(history, [{ role: "assistant", content: "I prepared a supplier update." }]);
});
