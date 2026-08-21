import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import { AIManagerError } from "@/lib/ai/errors";
import { MAX_TOOL_CALLS, MAX_TOOL_ROUNDS, OVERALL_AI_TIMEOUT_MS, PROVIDER_TIMEOUT_MS } from "@/lib/ai/limits";
import { buildAIManagerSystemPrompt } from "@/lib/ai/prompt";
import type { AIConversationMessage, AIManagerResult, AIProvider, AIProviderMessage, AIProviderResponse, AIRestaurantContext, AIToolDefinition } from "@/lib/ai/types";

type ToolResult = { content: string; activity: string };
type ToolExecutor = (input: { name: string; arguments: unknown; restaurant: AIRestaurantContext }) => Promise<ToolResult>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export function toolCacheKey(name: string, args: unknown) { return `${name}:${JSON.stringify(stableValue(args))}`; }

export async function runAIToolLoop(input: { provider: AIProvider; restaurant: AIRestaurantContext; history: AIConversationMessage[]; message: string; toolDefinitions: AIToolDefinition[]; executeTool: ToolExecutor; now?: Date }): Promise<AIManagerResult> {
  const messages: AIProviderMessage[] = [{ role: "system", content: buildAIManagerSystemPrompt(input.restaurant, input.now) }, ...input.history, { role: "user", content: input.message }];
  const toolsUsed: string[] = []; const activities: string[] = []; const cache = new Map<string, ToolResult>();
  const started = Date.now(); let totalCalls = 0; let providerRounds = 0;

  async function generate(tools: AIToolDefinition[], phase: "tools" | "synthesis"): Promise<AIProviderResponse> {
    const elapsed = Date.now() - started; const remaining = OVERALL_AI_TIMEOUT_MS - elapsed;
    if (remaining <= 0) throw new AIManagerError("TIMEOUT", "Overall AI request timed out.");
    providerRounds += 1; const roundStarted = Date.now();
    logAIOrchestration({ stage: "provider_start", phase, providerRound: providerRounds, toolRoundsCompleted: phase === "synthesis" ? MAX_TOOL_ROUNDS : providerRounds - 1, totalToolCalls: totalCalls, toolsEnabled: tools.length > 0, restaurantId: input.restaurant.id, provider: input.provider.name });
    try {
      const response = await input.provider.generate({ messages, tools, maxOutputTokens: 700, timeoutMs: Math.min(PROVIDER_TIMEOUT_MS, remaining) });
      logAIOrchestration({ stage: "provider_complete", phase, providerRound: providerRounds, totalToolCalls: totalCalls, requestedToolCalls: response.toolCalls.length, finishReason: response.finishReason, selectedModel: response.selectedModel, durationMs: Date.now() - roundStarted, restaurantId: input.restaurant.id, provider: input.provider.name });
      return response;
    } catch (error) {
      const code = error instanceof AIManagerError ? error.code : "PROVIDER";
      logAIOrchestration({ stage: "failure", phase, reason: diagnosticReason(code), providerRound: providerRounds, totalToolCalls: totalCalls, durationMs: Date.now() - roundStarted, restaurantId: input.restaurant.id, provider: input.provider.name });
      throw error instanceof AIManagerError ? error : new AIManagerError("PROVIDER", "Provider request failed.");
    }
  }

  function finalResult(response: AIProviderResponse) {
    if (!response.content.trim()) throw new AIManagerError("FINAL_RESPONSE_MISSING", "Provider did not produce a final answer.");
    return { answer: response.content.trim().slice(0, 8_000), toolsUsed: [...new Set(toolsUsed)], activities: [...new Set(activities)] };
  }

  try {
    for (let toolRound = 1; toolRound <= MAX_TOOL_ROUNDS; toolRound += 1) {
      const response = await generate(input.toolDefinitions, "tools");
      if (!response.toolCalls.length) return finalResult(response);
      if (response.toolCalls.length > MAX_TOOL_CALLS - totalCalls) throw new AIManagerError("TOOL_CALL_LIMIT", "Maximum tool calls reached.");
      messages.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        totalCalls += 1;
        if (!call.id || call.id.length > 200 || !call.name || call.name.length > 100 || call.arguments.length > 8_000) throw new AIManagerError("MALFORMED_TOOL_CALL", "Malformed tool call.");
        let args: unknown;
        try { args = JSON.parse(call.arguments); } catch { throw new AIManagerError("MALFORMED_TOOL_CALL", "Tool arguments were not valid JSON."); }
        const key = toolCacheKey(call.name, args); let result = cache.get(key);
        if (result) logAIOrchestration({ stage: "tool_cache_hit", toolName: call.name, providerRound: providerRounds, totalToolCalls: totalCalls, restaurantId: input.restaurant.id });
        if (!result) {
          try { result = await input.executeTool({ name: call.name, arguments: args, restaurant: input.restaurant }); cache.set(key, result); }
          catch (error) { const code = error instanceof AIManagerError ? error.code : "TOOL_FAILED"; messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify({ error: code, message: "Tool request was rejected or unavailable." }) }); continue; }
        }
        toolsUsed.push(call.name); activities.push(result.activity);
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result.content });
      }
    }

    messages.push({ role: "system", content: "Tool collection is complete. Produce the final concise operational answer using only the collected tool results. Do not request or claim additional tool calls. Clearly separate facts from recommendations." });
    const synthesis = await generate([], "synthesis");
    if (synthesis.toolCalls.length) throw new AIManagerError("TOOL_ROUND_LIMIT", "Provider requested tools during disabled final synthesis.");
    return finalResult(synthesis);
  } catch (error) {
    const code = error instanceof AIManagerError ? error.code : "PROVIDER";
    logAIOrchestration({ stage: "request_failed", reason: diagnosticReason(code), providerRounds, totalToolCalls: totalCalls, durationMs: Date.now() - started, restaurantId: input.restaurant.id, provider: input.provider.name });
    throw error;
  }
}
