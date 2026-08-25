import assert from "node:assert/strict";
import test from "node:test";
import { getAIActionRegistration, getRegisteredAIActionTypes } from "@/lib/ai/action-registry";
import { AI_ACTION_POLICIES } from "@/lib/ai/action-policy";
import { validateOrderProposalTool } from "@/lib/ai/order-proposal-tool";
import { canTransitionOrder, shouldConsumeInventory } from "@/lib/orders/policy";
import { calculateOrderTotals } from "@/lib/orders/calculations";

test("create order proposal accepts canonical names but not trusted prices", () => {
  const value = validateOrderProposalTool({ action_type: "CREATE_ORDER", order_type: "DINE_IN", items: [{ menu_item_name: "Paneer Tikka", quantity: 2 }], discount: 10, tax: 20, explanation: "Create a dine-in order." });
  assert.deepEqual(value.items, [{ menuItemName: "Paneer Tikka", quantity: 2 }]);
  assert.equal("unitPrice" in value.items![0], false);
});
test("order proposal rejects unsupported type, prices, and tenant identifiers", () => {
  assert.throws(() => validateOrderProposalTool({ action_type: "DELETE_ORDER", explanation: "Delete it" }));
  assert.throws(() => validateOrderProposalTool({ action_type: "CREATE_ORDER", order_type: "DINE_IN", items: [{ menu_item_name: "Naan", quantity: 1, unit_price: 1 }], explanation: "Create" }));
  assert.throws(() => validateOrderProposalTool({ action_type: "CREATE_ORDER", order_type: "DINE_IN", items: [{ menu_item_name: "Naan", quantity: 1 }], restaurantId: "tenant-b", explanation: "Create" }));
});
test("order proposal validates order types and exact transition targets", () => {
  assert.throws(() => validateOrderProposalTool({ action_type: "CREATE_ORDER", order_type: "CURBSIDE", items: [{ menu_item_name: "Naan", quantity: 1 }], explanation: "Create" }));
  assert.throws(() => validateOrderProposalTool({ action_type: "TRANSITION_ORDER_STATUS", order_number: "RP-104", status: "DELETED", explanation: "Move" }));
  assert.equal(validateOrderProposalTool({ action_type: "TRANSITION_ORDER_STATUS", order_number: "RP-104", status: "PREPARING", explanation: "Start" }).status, "PREPARING");
});
test("order actions are registered medium-risk admin approvals", () => {
  for (const type of ["CREATE_ORDER", "UPDATE_ORDER_ITEMS", "TRANSITION_ORDER_STATUS"] as const) { assert.equal(getAIActionRegistration(type)?.handlerKey, "order"); assert.equal(AI_ACTION_POLICIES[type].riskLevel, "MEDIUM"); assert.equal(AI_ACTION_POLICIES[type].authorization, "ORGANIZATION_ADMIN"); assert.equal(AI_ACTION_POLICIES[type].humanApprovalRequired, true); }
});
test("no permanent order delete action is registered", () => { assert.equal(getRegisteredAIActionTypes().includes("DELETE_ORDER" as never), false); });
test("existing lifecycle remains authoritative and preparation consumes once", () => { assert.equal(canTransitionOrder("PENDING", "CONFIRMED"), true); assert.equal(canTransitionOrder("CONFIRMED", "PREPARING"), true); assert.equal(canTransitionOrder("PENDING", "READY"), false); assert.equal(shouldConsumeInventory("CONFIRMED", "PREPARING", null), true); assert.equal(shouldConsumeInventory("CONFIRMED", "PREPARING", new Date()), false); });
test("order totals remain deterministic and server-calculated", () => { assert.deepEqual(calculateOrderTotals([{ menuItemId: "a", quantity: 2, unitPrice: "300" }, { menuItemId: "b", quantity: 3, unitPrice: "80" }], "10", "20"), { subtotal: "840.00", discount: "10.00", tax: "20.00", total: "850.00" }); });
