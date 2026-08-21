import assert from "node:assert/strict";
import test from "node:test";
import { AIManagerError, safeAIErrorMessage } from "../errors";
import { MAX_HISTORY_MESSAGES, MAX_TOOL_ROUNDS, MAX_USER_MESSAGE_LENGTH, validateConversationInput } from "../limits";
import { runAIToolLoop } from "../orchestrator";
import { serializeToolResult } from "../serialization";
import { getReadOnlyToolContractNames, getReadOnlyToolContracts, validateReadOnlyToolArguments } from "../tool-contracts";
import type { AIProvider, AIProviderRequest, AIProviderResponse, AIRestaurantContext } from "../types";

const restaurant: AIRestaurantContext = { id: "internal-tenant-id", name: "Test Kitchen", timezone: "Asia/Kolkata", currency: "INR", guestCapacity: 80 };
const tool = (id: string, name: string, args: unknown): AIProviderResponse => ({ content: "", toolCalls: [{ id, name, arguments: typeof args === "string" ? args : JSON.stringify(args) }], finishReason: "tool_calls" });

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
  assert.equal(names.length, 13);
  assert.equal(names.some((name) => /create|update|delete|sql|query|write/i.test(name)), false);
  assert.throws(() => validateReadOnlyToolArguments("run_sql", {}, restaurant), AIManagerError);
});

test("multi-tool loop injects trusted tenant context and returns approved activity", async () => {
  const provider = new SequenceProvider([
    { content: "", toolCalls: [tool("a", "get_low_stock_items", {}).toolCalls[0], tool("b", "get_reservation_summary", { start_date: "2026-08-21", end_date: "2026-08-21" }).toolCalls[0]], finishReason: "tool_calls" },
    { content: "Stock and reservations both need review.", toolCalls: [], finishReason: "stop" },
  ]);
  const executed: string[] = [];
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What needs attention?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async ({ name, restaurant: trusted }) => { assert.equal(trusted.id, restaurant.id); executed.push(name); return { content: "{}", activity: name }; } });
  assert.deepEqual(executed, ["get_low_stock_items", "get_reservation_summary"]);
  assert.deepEqual(result.toolsUsed, executed);
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

test("three data rounds finish through a dedicated synthesis call with tools disabled", async () => {
  const provider = new SequenceProvider([
    { content: "", toolCalls: [tool("inventory", "get_low_stock_items", {}).toolCalls[0], tool("reservations", "get_reservation_summary", { start_date: "2026-08-21", end_date: "2026-08-21" }).toolCalls[0]], finishReason: "tool_calls" },
    tool("revenue", "get_daily_revenue", { start_date: "2026-08-21", end_date: "2026-08-21" }),
    tool("comparison", "compare_revenue", { current_start_date: "2026-08-21", current_end_date: "2026-08-21", comparison_start_date: "2026-08-20", comparison_end_date: "2026-08-20" }),
    { content: "Inventory, reservations, and revenue have been analyzed.", toolCalls: [], finishReason: "stop" },
  ]);
  const executed: string[] = [];
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "What needs my attention today?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async ({ name }) => { executed.push(name); return { content: "{}", activity: name }; } });
  assert.equal(result.answer, "Inventory, reservations, and revenue have been analyzed.");
  assert.deepEqual(executed, ["get_low_stock_items", "get_reservation_summary", "get_daily_revenue", "compare_revenue"]);
  assert.equal(provider.requests.length, 4);
  assert.ok(provider.requests.slice(0, 3).every((request) => request.tools.length === 13));
  assert.equal(provider.requests[3].tools.length, 0);
});

test("tool-round exhaustion is bounded even if synthesis requests another tool", async () => {
  const responses = [...Array.from({ length: MAX_TOOL_ROUNDS }, (_, index) => tool(String(index), "get_revenue", { start_date: `2026-08-0${index + 1}`, end_date: `2026-08-0${index + 1}` })), tool("forbidden-extra", "get_low_stock_items", {})];
  const provider = new SequenceProvider(responses);
  let calls = 0;
  await assert.rejects(() => runAIToolLoop({ provider, restaurant, history: [], message: "Keep going", toolDefinitions: getReadOnlyToolContracts(), executeTool: async () => { calls += 1; return { content: "{}", activity: "Checking sales..." }; } }), (error: unknown) => error instanceof AIManagerError && error.code === "TOOL_ROUND_LIMIT");
  assert.equal(calls, MAX_TOOL_ROUNDS);
  assert.equal(provider.requests.at(-1)?.tools.length, 0);
});

test("identical tool calls reuse their bounded in-request result", async () => {
  const sameArgs = { start_date: "2026-08-21", end_date: "2026-08-21" };
  const provider = new SequenceProvider([tool("first", "get_daily_revenue", sameArgs), tool("second", "get_daily_revenue", { end_date: "2026-08-21", start_date: "2026-08-21" }), { content: "Revenue checked once.", toolCalls: [], finishReason: "stop" }]);
  let executions = 0;
  const result = await runAIToolLoop({ provider, restaurant, history: [], message: "Revenue?", toolDefinitions: getReadOnlyToolContracts(), executeTool: async () => { executions += 1; return { content: "{\"revenue\":700}", activity: "Checking sales..." }; } });
  assert.equal(executions, 1); assert.equal(result.answer, "Revenue checked once.");
});

test("conversation and response serialization are bounded and safe", () => {
  assert.throws(() => validateConversationInput({ message: "x".repeat(MAX_USER_MESSAGE_LENGTH + 1), history: [] }), AIManagerError);
  const history = Array.from({ length: 15 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: String(index) }));
  assert.equal(validateConversationInput({ message: " hello ", history }).history.length, MAX_HISTORY_MESSAGES);
  assert.throws(() => validateConversationInput({ message: "hi", history: [], restaurantId: "attacker" }), AIManagerError);
  const serialized = serializeToolResult({ restaurantId: "secret", id: "row-id", name: "Paneer", nested: [1, 2] });
  assert.doesNotMatch(serialized, /secret|row-id/);
  assert.match(serialized, /Paneer/);
});

test("provider errors map to safe browser messages", async () => {
  const provider = new SequenceProvider([new AIManagerError("TIMEOUT", "internal timeout details")]);
  let caught: unknown;
  try { await runAIToolLoop({ provider, restaurant, history: [], message: "Revenue?", toolDefinitions: [], executeTool: async () => ({ content: "", activity: "" }) }); } catch (error) { caught = error; }
  assert.equal(safeAIErrorMessage(caught), "The AI service took too long to respond. Please try again.");
  assert.doesNotMatch(safeAIErrorMessage(new Error("key=secret")), /secret/);
});
