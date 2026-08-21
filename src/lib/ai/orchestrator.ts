import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import { AIManagerError } from "@/lib/ai/errors";
import { MAX_ASSISTANT_MESSAGE_LENGTH, MAX_TOOL_CALLS, MAX_TOOL_ROUNDS, OVERALL_AI_TIMEOUT_MS, PROVIDER_TIMEOUT_MS } from "@/lib/ai/limits";
import { buildAIManagerSystemPrompt } from "@/lib/ai/prompt";
import type { PurchaseOrderProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIConversationMessage, AIOrchestrationResult, AIProvider, AIProviderMessage, AIProviderResponse, AIRestaurantContext, AIToolDefinition } from "@/lib/ai/types";

type ToolResult = { content: string; activity: string; proposalCandidate?: PurchaseOrderProposalCandidate };
type ToolExecutor = (input: { name: string; arguments: unknown; restaurant: AIRestaurantContext }) => Promise<ToolResult>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export function toolCacheKey(name: string, args: unknown) { return `${name}:${JSON.stringify(stableValue(args))}`; }

function containsProviderEnvelope(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProviderEnvelope);
  if (!value || typeof value !== "object") return false;
  const entries = Object.entries(value);
  if (entries.some(([key]) => ["tool_calls", "tool_call_id", "function_call", "provider_metadata"].includes(key))) return true;
  return entries.some(([, item]) => containsProviderEnvelope(item));
}

export function validateFinalAnswer(value: unknown, selectedModel?: string) {
  if (selectedModel && /(?:content[-_/ ]?safety|safeguard|rerank|embedding)/i.test(selectedModel)) throw new AIManagerError("INVALID_RESPONSE", "A non-conversational model was selected for synthesis.");
  if (typeof value !== "string" || !value.trim()) throw new AIManagerError("FINAL_RESPONSE_MISSING", "Provider did not produce a final answer.");
  const answer = value.trim();
  if (answer.length > MAX_ASSISTANT_MESSAGE_LENGTH) throw new AIManagerError("INVALID_RESPONSE", "Final response exceeds the safe length limit.");
  try { if (containsProviderEnvelope(JSON.parse(answer))) throw new AIManagerError("INVALID_RESPONSE", "Final response contained a provider transcript."); } catch (error) { if (error instanceof AIManagerError) throw error; }
  return answer;
}

export async function runAIToolLoop(input: { provider: AIProvider; restaurant: AIRestaurantContext; history: AIConversationMessage[]; message: string; toolDefinitions: AIToolDefinition[]; executeTool: ToolExecutor; now?: Date }): Promise<AIOrchestrationResult> {
  const messages: AIProviderMessage[] = [{ role: "system", content: buildAIManagerSystemPrompt(input.restaurant, input.now) }, ...input.history, { role: "user", content: input.message }];
  const toolsUsed: string[] = []; const activities: string[] = []; const cache = new Map<string, ToolResult>();
  const started = Date.now(); let totalCalls = 0; let providerRounds = 0; let collectionRounds = 0; let lastToolCapableModel: string | undefined; let proposalCandidate: PurchaseOrderProposalCandidate | undefined;

  async function generate(tools: AIToolDefinition[], phase: "tools" | "synthesis"): Promise<AIProviderResponse> {
    const elapsed = Date.now() - started; const remaining = OVERALL_AI_TIMEOUT_MS - elapsed;
    if (remaining <= 0) throw new AIManagerError("TIMEOUT", "Overall AI request timed out.");
    providerRounds += 1; const roundStarted = Date.now();
    logAIOrchestration({ stage: "provider_start", phase, providerRound: providerRounds, collectionRounds, totalToolCalls: totalCalls, toolsEnabled: phase === "tools" && tools.length > 0, toolChoice: phase === "synthesis" ? "none" : "auto", restaurantId: input.restaurant.id, provider: input.provider.name });
    try {
      const response = await input.provider.generate({ messages, tools, toolChoice: phase === "synthesis" ? "none" : "auto", preferredModel: phase === "synthesis" ? lastToolCapableModel : undefined, maxOutputTokens: 700, timeoutMs: Math.min(PROVIDER_TIMEOUT_MS, remaining) });
      logAIOrchestration({ stage: "provider_complete", phase, providerRound: providerRounds, collectionRounds, totalToolCalls: totalCalls, requestedToolCalls: response.toolCalls.length, textAccompaniedToolCalls: response.toolCalls.length > 0 && Boolean(response.content.trim()), finishReason: response.finishReason, selectedModel: response.selectedModel, durationMs: Date.now() - roundStarted, restaurantId: input.restaurant.id, provider: input.provider.name });
      return response;
    } catch (error) {
      const code = error instanceof AIManagerError ? error.code : "PROVIDER";
      logAIOrchestration({ stage: "failure", phase, reason: diagnosticReason(code), providerRound: providerRounds, totalToolCalls: totalCalls, durationMs: Date.now() - roundStarted, restaurantId: input.restaurant.id, provider: input.provider.name });
      throw error instanceof AIManagerError ? error : new AIManagerError("PROVIDER", "Provider request failed.");
    }
  }

  try {
    for (let toolRound = 1; toolRound <= MAX_TOOL_ROUNDS; toolRound += 1) {
      collectionRounds = toolRound;
      const response = await generate(input.toolDefinitions, "tools");
      if (!response.toolCalls.length) {
        logAIOrchestration({ stage: "collection_stopped", collectionRound: toolRound, reason: "NO_TOOL_CALLS", discardedCollectionText: Boolean(response.content.trim()), totalToolCalls: totalCalls, restaurantId: input.restaurant.id });
        break;
      }
      if (response.selectedModel) lastToolCapableModel = response.selectedModel;
      if (response.toolCalls.length > MAX_TOOL_CALLS - totalCalls) throw new AIManagerError("TOOL_CALL_LIMIT", "Maximum tool calls reached.");
      // Collection prose is provider-internal and must never influence browser history or final presentation.
      messages.push({ role: "assistant", content: "", toolCalls: response.toolCalls });
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
        if (result.proposalCandidate) proposalCandidate = result.proposalCandidate;
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result.content });
      }
    }

    messages.push({ role: "system", content: `Tool collection is complete. Return only the restaurant-owner-facing answer. Do not describe reasoning, planning, possible tool calls, or internal orchestration. Do not request or claim additional tool calls. Use only verified restaurant facts supplied by successful tool results. ${toolsUsed.length ? "Clearly distinguish facts, inferences, and recommendations." : "No restaurant data tool succeeded, so do not make restaurant-specific factual claims; clearly say that verified restaurant data was unavailable for this answer."}` });
    logAIOrchestration({ stage: "synthesis_started", collectionRounds, totalToolCalls: totalCalls, successfulTools: toolsUsed.length, restaurantId: input.restaurant.id, provider: input.provider.name });
    const synthesis = await generate(input.toolDefinitions, "synthesis");
    if (synthesis.toolCalls.length) throw new AIManagerError("TOOL_ROUND_LIMIT", "Provider requested tools during disabled final synthesis.");
    const answer = validateFinalAnswer(synthesis.content, synthesis.selectedModel);
    logAIOrchestration({ stage: "synthesis_completed", collectionRounds, totalToolCalls: totalCalls, answerLength: answer.length, restaurantId: input.restaurant.id, provider: input.provider.name });
    return { answer, toolsUsed: [...new Set(toolsUsed)], activities: [...new Set(activities)], ...(proposalCandidate ? { proposalCandidate } : {}) };
  } catch (error) {
    const code = error instanceof AIManagerError ? error.code : "PROVIDER";
    logAIOrchestration({ stage: "request_failed", reason: diagnosticReason(code), providerRounds, totalToolCalls: totalCalls, durationMs: Date.now() - started, restaurantId: input.restaurant.id, provider: input.provider.name });
    throw error;
  }
}
