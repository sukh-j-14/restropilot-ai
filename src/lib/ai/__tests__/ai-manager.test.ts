import assert from "node:assert/strict";
import test from "node:test";
import { AIManagerError, safeAIErrorMessage } from "../errors";
import { buildBrowserConversationHistory } from "../history";
import { MAX_HISTORY_MESSAGES, MAX_TOOL_ROUNDS, MAX_USER_MESSAGE_LENGTH, validateConversationInput } from "../limits";
import { isCollectionInterimText, missingRequiredEvidence, normalizeOwnerFacingAnswer, requiredProposalTool, runAIToolLoop, validateFinalAnswer } from "../orchestrator";
import { resolveProviderConfiguration } from "../provider-config";
import { createFallbackProvider } from "../providers/fallback";
import { serializeToolResult } from "../serialization";
import { getReadOnlyToolContractNames, getReadOnlyToolContracts, validateReadOnlyToolArguments } from "../tool-contracts";
import type { AIProvider, AIProviderRequest, AIProviderResponse, AIRestaurantContext } from "../types";
import { validateProposalCandidate } from "../action-proposal-validation";
import { PURCHASE_ORDER_PROPOSAL_TOOL, purchaseOrderProposalToolDefinition } from "../proposal-tool";
import { assertNoProviderProtocolText, safeAssistantDisplayText } from "../provider-protocol";
import { getAIEvidenceLinks } from "../evidence";
import { resolveUniqueOperationalName } from "../name-resolution";
import { toGeminiSchema } from "../providers/gemini";

const restaurant: AIRestaurantContext = { id: "internal-tenant-id", name: "Test Kitchen", timezone: "Asia/Kolkata", currency: "INR", guestCapacity: 80 };
const tool = (id: string, name: string, args: unknown): AIProviderResponse => ({ content: "", toolCalls: [{ id, name, arguments: typeof args === "string" ? args : JSON.stringify(args) }], finishReason: "tool_calls" });

test("empty collection serialization is normalized for owner-facing answers", () => {
  assert.equal(normalizeOwnerFacingAnswer("There are currently none ([] low-stock items returned)."), "There are currently none (no low-stock items returned).");
});

test("explicit menu availability changes require the registered proposal tool", () => {
  assert.equal(requiredProposalTool("Make AI Test Pasta available again."), "propose_menu_recipe_action");
  assert.equal(requiredProposalTool("Put Butter Chicken back on the menu"), "propose_menu_recipe_action");
  assert.equal(requiredProposalTool("Remove Panneer from AI Test Pasta's recipe."), "propose_menu_recipe_action");
  assert.equal(requiredProposalTool("Add 500 g Panneer to AI Test Pasta's recipe."), "propose_menu_recipe_action");
  assert.equal(requiredProposalTool("Change Panneer usage in AI Test Pasta to 750g."), "propose_menu_recipe_action");
  assert.equal(requiredProposalTool("Is AI Test Pasta available?"), null);
  assert.equal(requiredProposalTool("Show me AI Test Pasta's recipe."), null);
});

class SequenceProvider implements AIProvider {
  readonly name = "fake";
  requests: AIProviderRequest[] = [];
  constructor(private readonly responses: Array<AIProviderResponse | Error>) {}
  async generate(request: AIProviderRequest) {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("Unexpected provider call");
    return response;
  }
}

test("provider configuration selects Gemini with OpenRouter fallback", () => {
  const configuration = resolveProviderConfiguration({
    NODE_ENV: "test",
    AI_PROVIDER: "gemini",
    AI_FALLBACK_PROVIDER: "openrouter",
    GEMINI_API_KEY: "test-gemini-key",
    GEMINI_MODEL: "gemini-test-model",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "openrouter-test-model",
  });
  assert.deepEqual(configuration, { primary: "gemini", fallback: "openrouter" });
  assert.throws(() => resolveProviderConfiguration({ NODE_ENV: "test", AI_PROVIDER: "unknown" }), (error: unknown) => error instanceof AIManagerError && error.code === "CONFIGURATION");
});

test("fallback runs only for provider failures and clears provider-specific model pinning", async () => {
  const request: AIProviderRequest = { messages: [{ role: "user", content: "hello" }], tools: [], toolChoice: "none", preferredModel: "gemini/provider-specific", maxOutputTokens: 100, timeoutMs: 1_000 };
  let fallbackRequest: AIProviderRequest | undefined;
  const fallback: AIProvider = { name: "fallback", async generate(input) { fallbackRequest = input; return { content: "fallback answer", toolCalls: [], finishReason: "stop" }; } };
  const transientPrimary: AIProvider = { name: "primary", async generate() { throw new AIManagerError("RATE_LIMIT", "private provider detail"); } };
  const response = await createFallbackProvider(transientPrimary, fallback).generate(request);
  assert.equal(response.content, "fallback answer");
  assert.equal(fallbackRequest?.preferredModel, undefined);

  let fallbackCalled = false;
  const guardedFallback: AIProvider = { name: "guarded", async generate() { fallbackCalled = true; return { content: "", toolCalls: [], finishReason: "stop" }; } };
  const invalidToolPrimary: AIProvider = { name: "primary", async generate() { throw new AIManagerError("INVALID_TOOL", "rejected"); } };
  await assert.rejects(() => createFallbackProvider(invalidToolPrimary, guardedFallback).generate(request), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_TOOL");
  assert.equal(fallbackCalled, false);
});

test("one orchestration session stays on one fallback model after primary failure", async () => {
  let primaryCalls = 0;
  const fallbackModels: Array<string | undefined> = [];
  const primary: AIProvider = { name: "primary", async generate() { primaryCalls += 1; throw new AIManagerError("PROVIDER", "unavailable"); } };
  const fallback: AIProvider = { name: "fallback", async generate(request) { fallbackModels.push(request.preferredModel); return { content: "ok", toolCalls: [], finishReason: "stop", selectedModel: "fallback/model-a" }; } };
  const session = createFallbackProvider(primary, fallback).createSession!();
  const request: AIProviderRequest = { messages: [{ role: "user", content: "hello" }], tools: [], toolChoice: "none", maxOutputTokens: 100, timeoutMs: 1_000 };
  await session.generate(request);
  await session.generate(request);
  assert.equal(primaryCalls, 1);
  assert.deepEqual(fallbackModels, [undefined, "fallback/model-a"]);
});

test("operational questions require minimum evidence before synthesis", () => {
  assert.deepEqual(missingRequiredEvidence("What should I reorder?", ["get_low_stock_items"]), ["existing purchase orders"]);
  assert.deepEqual(missingRequiredEvidence("Are we ready for Friday night?", []), ["reservations", "inventory", "existing purchase orders"]);
  assert.deepEqual(missingRequiredEvidence("Are we ready for Friday night?", ["get_reservation_summary", "get_low_stock_items", "list_purchase_orders"]), []);
  assert.equal(isCollectionInterimText("Collection complete."), true);
  assert.equal(isCollectionInterimText("Paneer is at 0 kg and needs attention."), false);
});

test("proposal resource spelling fallback is deterministic and ambiguity-safe", () => {
  assert.equal(resolveUniqueOperationalName([{ name: "Panneer" }], "Paneer")?.name, "Panneer");
  assert.equal(resolveUniqueOperationalName([{ name: "Panneer" }], "Panner")?.name, "Panneer");
  assert.equal(resolveUniqueOperationalName([{ name: "Paneer" }, { name: "Panneer" }], "Paneeer"), undefined);
  assert.equal(resolveUniqueOperationalName([{ name: "Onion" }], "Tomato"), undefined);
});

test("Gemini schema conversion represents optional null fields compatibly", () => {
  assert.deepEqual(toGeminiSchema({ type: ["string", "null"], maxLength: 40 }), { maxLength: 40, type: "string", nullable: true });
});

test("strict tool contracts validate dates, limits, enums, and extra fields", () => {
  const valid = validateReadOnlyToolArguments("get_top_selling_items", { start_date: "2026-08-01", end_date: "2026-08-21", limit: 5, ranking_mode: "revenue" }, restaurant) as { limit: number };
  assert.equal(valid.limit, 5);
  assert.throws(() => validateReadOnlyToolArguments("get_revenue", { start_date: "2026-02-30", end_date: "2026-03-01" }, restaurant), AIManagerError);
  assert.throws(() => validateReadOnlyToolArguments("get_revenue", { start_date: "2026-08-01", end_date: "2026-08-02", sql: "select 1" }, restaurant), AIManagerError);
  assert.throws(() => validateReadOnlyToolArguments("get_top_selling_items", { start_date: "2026-08-01", end_date: "2026-08-02", limit: 100, ranking_mode: "profit" }, restaurant), AIManagerError);
  assert.throws(() => validateReadOnlyToolArguments("list_purchase_orders", { status: "PAID" }, restaurant), AIManagerError);
});

test("allowlist contains only the approved read-only tools", () => {
  const names = getReadOnlyToolContractNames();
  assert.ok(names.includes("get_low_stock_items"));
  assert.ok(names.includes("list_purchase_orders"));
  assert.equal(names.length, 35);
  assert.ok(names.includes("list_menu_items"));
  assert.ok(names.includes("list_recipes"));
  assert.ok(names.includes("list_suppliers"));
  assert.ok(names.includes("list_recent_orders"));
  assert.equal(names.some((name) => /create|update|delete|sql|query|write/i.test(name)), false);
  assert.throws(() => validateReadOnlyToolArguments("run_sql", {}, restaurant), AIManagerError);
});

test("purchase-order proposal contract is strict and non-executing", () => {
  const candidate = validateProposalCandidate({ supplier_name: "Dairy Supplier", items: [{ ingredient_name: "Paneer", quantity: 12.5 }], explanation: "Stock is below the reorder level." });
  assert.equal(candidate.items[0].quantity, 12.5);
  assert.equal(PURCHASE_ORDER_PROPOSAL_TOOL, "propose_purchase_order_draft");
  assert.doesNotMatch(PURCHASE_ORDER_PROPOSAL_TOOL, /create|update|delete|order_now|receive/i);
  assert.throws(() => validateProposalCandidate({ type: "DELETE_INVENTORY", supplier_name: "x", items: [{ ingredient_name: "Paneer", quantity: 1 }], explanation: "x" }));
  assert.throws(() => validateProposalCandidate({ supplier_name: "x", items: [{ ingredient_name: "Paneer", quantity: -1 }], explanation: "x" }));
  assert.throws(() => validateProposalCandidate({ supplier_name: "x", items: [{ ingredient_name: "Paneer", quantity: 1 }, { ingredient_name: "paneer", quantity: 2 }], explanation: "x" }));
});

test("proposal tool uses Gemini-compatible numeric schema keywords", () => {
  const text = JSON.stringify(purchaseOrderProposalToolDefinition.parameters);
  assert.doesNotMatch(text, /exclusiveMinimum|exclusiveMaximum/);
  assert.match(text, /minimum/);
});

test("proposal metadata remains separate from the assistant answer and browser history", async () => {
  const args = { supplier_name: "Dairy Supplier", items: [{ ingredient_name: "Paneer", quantity: 12 }], explanation: "Low stock." };
  const provider = new SequenceProvider([tool("proposal", PURCHASE_ORDER_PROPOSAL_TOOL, args), { content: "I recommend reviewing a draft purchase order.", toolCalls: [], finishReason: "stop" }, { content: "**PROPOSED ACTION**\nReview the purchase-order draft below.", toolCalls: [], finishReason: "stop" }]);
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What should I do about Paneer?", toolDefinitions: [...getReadOnlyToolContracts(), purchaseOrderProposalToolDefinition], executeTool: async ({ name, arguments: value }) => ({ content: "{\"accepted\":true}", activity: "Preparing...", ...(name === PURCHASE_ORDER_PROPOSAL_TOOL ? { proposalCandidate: validateProposalCandidate(value) } : {}) }) });
  assert.equal(result.proposalCandidate && "supplierName" in result.proposalCandidate ? result.proposalCandidate.supplierName : undefined, "Dairy Supplier");
  assert.doesNotMatch(result.answer, /supplier_name|ingredient_name|proposalCandidate/);
  const history = buildBrowserConversationHistory([{ role: "assistant", content: result.answer, actionProposal: result.proposalCandidate }]);
  assert.deepEqual(history, [{ role: "assistant", content: result.answer }]);
});

test("multi-tool loop injects trusted tenant context and returns approved activity", async () => {
  const provider = new SequenceProvider([
    { content: "Maybe I should call some tools first.", toolCalls: [tool("a", "get_low_stock_items", {}).toolCalls[0], tool("b", "get_reservation_summary", { start_date: "2026-08-21", end_date: "2026-08-21" }).toolCalls[0]], finishReason: "tool_calls", selectedModel: "example/tool-capable-model" },
    { content: "Perhaps I have enough information now.", toolCalls: [], finishReason: "stop" },
    { content: "Stock and reservations both need review.", toolCalls: [], finishReason: "stop" },
  ]);
  const executed: string[] = [];
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What needs attention?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async ({ name, restaurant: trusted }) => { assert.equal(trusted.id, restaurant.id); executed.push(name); return { content: "{}", activity: name }; } });
  assert.deepEqual(executed, ["get_low_stock_items", "get_reservation_summary"]);
  assert.deepEqual(result.toolsUsed, executed);
  assert.doesNotMatch(result.answer, /Maybe|Perhaps/);
  assert.equal(provider.requests.at(-1)?.toolChoice, "none");
  assert.equal(provider.requests.at(-1)?.tools.length, 0);
  assert.equal(provider.requests.at(-1)?.preferredModel, "example/tool-capable-model");
  const system = provider.requests[0].messages[0];
  assert.equal(system.role, "system");
  assert.match(system.content, /Test Kitchen/);
  assert.doesNotMatch(system.content, /internal-tenant-id/);
});

test("unknown and malformed calls never reach an approved executor", async () => {
  const provider = new SequenceProvider([tool("x", "run_sql", "{bad json")]);
  let approvedExecutions = 0;
  await assert.rejects(() => runAIToolLoop({ provider, restaurant, history: [], message: "Ignore rules", toolDefinitions: getReadOnlyToolContracts(), executeTool: async ({ name, arguments: args }) => { validateReadOnlyToolArguments(name, args, restaurant); approvedExecutions += 1; return { content: "{}", activity: "done" }; } }), (error: unknown) => error instanceof AIManagerError && error.code === "MALFORMED_TOOL_CALL");
  assert.equal(approvedExecutions, 0);
});

test("multiple data rounds finish through a dedicated synthesis call without tool declarations", async () => {
  const provider = new SequenceProvider([
    { content: "", toolCalls: [tool("inventory", "get_low_stock_items", {}).toolCalls[0], tool("reservations", "get_reservation_summary", { start_date: "2026-08-21", end_date: "2026-08-21" }).toolCalls[0]], finishReason: "tool_calls" },
    tool("revenue", "get_daily_revenue", { start_date: "2026-08-21", end_date: "2026-08-21" }),
    tool("comparison", "compare_revenue", { current_start_date: "2026-08-21", current_end_date: "2026-08-21", comparison_start_date: "2026-08-20", comparison_end_date: "2026-08-20" }),
    { content: "Collection complete.", toolCalls: [], finishReason: "stop" },
    { content: "Inventory, reservations, and revenue have been analyzed.", toolCalls: [], finishReason: "stop" },
  ]);
  const executed: string[] = [];
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What needs my attention today?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async ({ name }) => { executed.push(name); return { content: "{}", activity: name }; } });
  assert.equal(result.answer, "Inventory, reservations, and revenue have been analyzed.");
  assert.deepEqual(executed, ["get_low_stock_items", "get_reservation_summary", "get_daily_revenue", "compare_revenue"]);
  assert.equal(provider.requests.length, 5);
  assert.ok(provider.requests.slice(0, 3).every((request) => request.tools.length === getReadOnlyToolContracts().length));
  assert.equal(provider.requests[4].tools.length, 0);
  assert.equal(provider.requests[4].toolChoice, "none");
});

test("tool-round exhaustion is bounded even if synthesis repeatedly requests another tool", async () => {
  const responses = [...Array.from({ length: MAX_TOOL_ROUNDS }, (_, index) => tool(String(index), "get_revenue", { start_date: `2026-08-0${index + 1}`, end_date: `2026-08-0${index + 1}` })), tool("forbidden-extra", "get_low_stock_items", {}), tool("forbidden-retry", "get_low_stock_items", {})];
  const provider = new SequenceProvider(responses);
  let calls = 0;
  await assert.rejects(() => runAIToolLoop({ provider, restaurant, history: [], message: "Keep going", toolDefinitions: getReadOnlyToolContracts(), executeTool: async () => { calls += 1; return { content: "{}", activity: "Checking sales..." }; } }), (error: unknown) => error instanceof AIManagerError && error.code === "TOOL_ROUND_LIMIT");
  assert.equal(calls, MAX_TOOL_ROUNDS);
  assert.equal(provider.requests.at(-1)?.tools.length, 0);
  assert.equal(provider.requests.at(-1)?.toolChoice, "none");
});

test("identical tool calls reuse their bounded in-request result", async () => {
  const sameArgs = { start_date: "2026-08-21", end_date: "2026-08-21" };
  const provider = new SequenceProvider([tool("first", "get_daily_revenue", sameArgs), tool("second", "get_daily_revenue", { end_date: "2026-08-21", start_date: "2026-08-21" }), { content: "I should now answer.", toolCalls: [], finishReason: "stop" }, { content: "Revenue checked once.", toolCalls: [], finishReason: "stop" }]);
  let executions = 0;
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "Revenue?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async () => { executions += 1; return { content: "{\"revenue\":700}", activity: "Checking sales..." }; } });
  assert.equal(executions, 1); assert.equal(result.answer, "Revenue checked once.");
});

test("conversation and response serialization are bounded and safe", () => {
  assert.throws(() => validateConversationInput({ message: "x".repeat(MAX_USER_MESSAGE_LENGTH + 1), history: [] }), AIManagerError);
  const history = Array.from({ length: 15 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: String(index) }));
  assert.equal(validateConversationInput({ message: " hello ", history }).history.length, MAX_HISTORY_MESSAGES);
  assert.throws(() => validateConversationInput({ message: "hi", history: [], restaurantId: "attacker" }), AIManagerError);
  const serialized = serializeToolResult({ restaurantId: "secret", id: "row-id", name: "Paneer", customerName: "Private Guest", email: "private@example.com", phone: "555-0100", nested: [1, 2] });
  assert.doesNotMatch(serialized, /secret|row-id|Private Guest|private@example|555-0100/);
  assert.match(serialized, /Paneer/);
});

test("expanded operational tools retain strict argument validation", () => {
  const recent = validateReadOnlyToolArguments("list_recent_orders", { status: "COMPLETED", order_type: "DINE_IN", limit: 25 }, restaurant) as { limit: number };
  assert.equal(recent.limit, 25);
  assert.throws(() => validateReadOnlyToolArguments("list_recent_orders", { limit: 500 }, restaurant), AIManagerError);
  assert.throws(() => validateReadOnlyToolArguments("list_suppliers", { include_contacts: true }, restaurant), AIManagerError);
});

test("browser history accepts only strict user and assistant messages", () => {
  const longAssistantAnswer = `Revenue was ₹700. ${"Operational detail. ".repeat(100)}`;
  assert.ok(longAssistantAnswer.length > MAX_USER_MESSAGE_LENGTH);
  const valid = validateConversationInput({ message: "Follow up", history: [{ role: "user", content: "How were sales?" }, { role: "assistant", content: longAssistantAnswer }] });
  assert.equal(valid.history.length, 2);
  assert.throws(() => validateConversationInput({ message: "Follow up", history: [{ role: "tool", content: "{}", tool_call_id: "x" }] }), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_HISTORY");
  assert.throws(() => validateConversationInput({ message: "Follow up", history: [{ role: "assistant", content: "answer", tool_calls: [] }] }), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_HISTORY");
});

test("client history strips display metadata and skips poisoned entries", () => {
  const history = buildBrowserConversationHistory([{ role: "user", content: "Question", toolsUsed: ["ignored"] }, { role: "tool", content: "secret" }, { role: "assistant", content: "Answer", toolsUsed: ["get_revenue"] }, { role: "assistant", content: "error", error: true }]);
  assert.deepEqual(history, [{ role: "user", content: "Question" }, { role: "assistant", content: "Answer" }]);
});

test("tool-backed final answer can be used safely in a follow-up request", async () => {
  const firstProvider = new SequenceProvider([tool("sales", "get_revenue", { start_date: "2026-08-21", end_date: "2026-08-21" }), { content: "Now I can answer.", toolCalls: [], finishReason: "stop" }, { content: "Today's verified revenue is ₹700.", toolCalls: [], finishReason: "stop" }]);
  const executeTool = async () => ({ content: "{\"revenue\":700}", activity: "Checking sales..." });
  const first = await runAIToolLoop({ provider: firstProvider, restaurant, history: [], message: "Revenue today?", toolDefinitions: getReadOnlyToolContracts(), executeTool });
  const nextInput = validateConversationInput({ message: "And what should I watch?", history: [{ role: "user", content: "Revenue today?" }, { role: "assistant", content: first.answer }] });
  const secondProvider = new SequenceProvider([{ content: "No additional tool is required.", toolCalls: [], finishReason: "stop" }, { content: "Watch whether the trend continues.", toolCalls: [], finishReason: "stop" }]);
  const second = await runAIToolLoop({ provider: secondProvider, restaurant, history: nextInput.history, message: nextInput.message, toolDefinitions: getReadOnlyToolContracts(), executeTool });
  assert.equal(second.answer, "Watch whether the trend continues.");
});

test("final response rejects serialized provider tool envelopes", () => {
  assert.throws(() => validateFinalAnswer('{"tool_calls":[{"id":"x"}]}'), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_RESPONSE");
  assert.throws(() => validateFinalAnswer("User Safety: safe\nResponse Safety: safe", "nvidia/nemotron-3.5-content-safety:free"), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_RESPONSE");
});

test("provider protocol text is rejected and never becomes visible assistant content", async () => {
  const leaked = '<dots_function_call><invoke name="list_purchase_orders"></invoke></dots_function_call>';
  assert.throws(() => assertNoProviderProtocolText(leaked), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_RESPONSE");
  assert.throws(() => validateFinalAnswer(leaked), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_RESPONSE");
  assert.doesNotMatch(safeAssistantDisplayText(leaked), /dots_function_call|list_purchase_orders/);
  const provider = new SequenceProvider([{ content: leaked, toolCalls: [], finishReason: "stop" }]);
  let executions = 0;
  await assert.rejects(() => runAIToolLoop({ provider, restaurant, history: [], message: "What should I reorder?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async () => { executions += 1; return { content: "{}", activity: "done" }; } }), (error: unknown) => error instanceof AIManagerError && error.code === "INVALID_RESPONSE");
  assert.equal(executions, 0);
});

test("a nonessential read failure still permits a grounded partial answer", async () => {
  const provider = new SequenceProvider([
    { content: "", toolCalls: [tool("inventory", "get_low_stock_items", {}).toolCalls[0], tool("pos", "list_purchase_orders", {}).toolCalls[0]], finishReason: "tool_calls" },
    { content: "Enough data collected.", toolCalls: [], finishReason: "stop" },
    { content: "Paneer is low. I could not verify incoming purchase orders, so I cannot safely recommend another order yet.", toolCalls: [], finishReason: "stop" },
  ]);
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What should I reorder?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async ({ name }) => {
    if (name === "list_purchase_orders") throw new AIManagerError("TOOL_FAILED", "database unavailable");
    return { content: '{"items":[{"name":"Paneer","currentStock":0,"reorderLevel":10}]}', activity: "Checking inventory" };
  } });
  assert.match(result.answer, /Paneer is low/);
  assert.match(result.answer, /could not verify/i);
  assert.deepEqual(result.toolsUsed, ["get_low_stock_items"]);
});

test("provider continuation failure preserves verified tools through fresh synthesis", async () => {
  const provider = new SequenceProvider([
    tool("inventory", "get_low_stock_items", {}),
    new AIManagerError("PROVIDER", "continuation failed"),
    { content: "Inventory shows Paneer is low. Purchase orders could not be verified.", toolCalls: [], finishReason: "stop" },
  ]);
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What needs attention?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async () => ({ content: '{"items":[{"name":"Paneer"}]}', activity: "Checking inventory" }) });
  assert.match(result.answer, /Paneer is low/);
  assert.deepEqual(result.toolsUsed, ["get_low_stock_items"]);
  assert.equal(provider.requests.at(-1)?.toolChoice, "none");
});

test("Paneer handling can complete four evidence rounds and reach the existing proposal tool", async () => {
  const args = { supplier_name: "Punjab Dairy Supplies", items: [{ ingredient_name: "Paneer", quantity: 15 }], explanation: "Paneer is below its reorder level and no open purchase order covers it." };
  const provider = new SequenceProvider([
    tool("ingredient", "get_ingredient_details", { name: "Paneer" }),
    tool("orders", "list_purchase_orders", {}),
    tool("supplier", "find_suppliers_for_ingredient", { ingredient_name: "Paneer" }),
    tool("proposal", PURCHASE_ORDER_PROPOSAL_TOOL, args),
    { content: "Proposal prepared.", toolCalls: [], finishReason: "stop" },
    { content: "I prepared a draft purchase-order recommendation for review. Nothing has been ordered.", toolCalls: [], finishReason: "stop" },
  ]);
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "Handle the Paneer issue", toolDefinitions: [...getReadOnlyToolContracts(), purchaseOrderProposalToolDefinition], executeTool: async ({ name, arguments: value }) => ({ content: '{"accepted":true}', activity: name, ...(name === PURCHASE_ORDER_PROPOSAL_TOOL ? { proposalCandidate: validateProposalCandidate(value) } : {}) }) });
  assert.ok(result.proposalCandidate);
  assert.match(result.answer, /prepared/i);
  assert.equal(provider.requests.at(-1)?.tools.length, 0);
});

test("an existing open purchase order produces analysis without a duplicate proposal", async () => {
  const provider = new SequenceProvider([
    { content: "", toolCalls: [tool("inventory", "get_ingredient_details", { name: "Paneer" }).toolCalls[0], tool("orders", "list_purchase_orders", { status: "ORDERED" }).toolCalls[0]], finishReason: "tool_calls" },
    { content: "No more data needed.", toolCalls: [], finishReason: "stop" },
    { content: "Paneer is low, but an open order already has 15 kg incoming. Review or expedite that order instead of creating a duplicate.", toolCalls: [], finishReason: "stop" },
  ]);
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "Handle the Paneer issue", toolDefinitions: [...getReadOnlyToolContracts(), purchaseOrderProposalToolDefinition], executeTool: async ({ name }) => ({ content: name === "list_purchase_orders" ? '{"orders":[{"status":"ORDERED","items":[{"ingredient":"Paneer","quantity":15}]}]}' : '{"name":"Paneer","currentStock":3,"reorderLevel":10}', activity: name }) });
  assert.equal(result.proposalCandidate, undefined);
  assert.match(result.answer, /instead of creating a duplicate/i);
});

test("internal tool names become bounded user-facing evidence navigation", () => {
  assert.deepEqual(getAIEvidenceLinks(["get_low_stock_items", "get_inventory_status", "list_purchase_orders", "run_sql"]), [
    { label: "Inventory", href: "/inventory" },
    { label: "Purchase orders", href: "/purchase-orders" },
  ]);
});

test("provider errors map to safe browser messages", async () => {
  const provider = new SequenceProvider([new AIManagerError("TIMEOUT", "internal timeout details")]);
  let caught: unknown;
  try { await runAIToolLoop({ provider, restaurant, history: [], message: "Revenue?", toolDefinitions: [], executeTool: async () => ({ content: "", activity: "" }) }); } catch (error) { caught = error; }
  assert.equal(safeAIErrorMessage(caught), "The AI service took too long to respond. Please try again.");
  assert.doesNotMatch(safeAIErrorMessage(new Error("key=secret")), /secret/);
});
