import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import { AIManagerError } from "@/lib/ai/errors";
import { MAX_ASSISTANT_MESSAGE_LENGTH, MAX_TOOL_CALLS, MAX_TOOL_ROUNDS, OVERALL_AI_TIMEOUT_MS, PROVIDER_TIMEOUT_MS } from "@/lib/ai/limits";
import { buildAIManagerSystemPrompt } from "@/lib/ai/prompt";
import { assertNoProviderProtocolText } from "@/lib/ai/provider-protocol";
import type { AIProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIConversationMessage, AIOrchestrationResult, AIProvider, AIProviderMessage, AIProviderResponse, AIRestaurantContext, AIToolDefinition } from "@/lib/ai/types";

type ToolResult = { content: string; activity: string; proposalCandidate?: AIProposalCandidate };
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
  const answer = normalizeOwnerFacingAnswer(assertNoProviderProtocolText(value.trim()));
  if (answer.length > MAX_ASSISTANT_MESSAGE_LENGTH) throw new AIManagerError("INVALID_RESPONSE", "Final response exceeds the safe length limit.");
  try { if (containsProviderEnvelope(JSON.parse(answer))) throw new AIManagerError("INVALID_RESPONSE", "Final response contained a provider transcript."); } catch (error) { if (error instanceof AIManagerError) throw error; }
  return answer;
}

/** Remove small serialization artifacts without interpreting or executing model output. */
export function normalizeOwnerFacingAnswer(value: string) {
  return value
    .replace(/\(\s*\[\]\s+([^)]+)\)/g, "(no $1)")
    .replace(/\b\[\]\s+(?=(?:low-stock|inventory|reservation|order|purchase-order)\b)/gi, "no ");
}

const INVENTORY_EVIDENCE = new Set(["get_low_stock_items", "get_inventory_status", "get_ingredient_details", "find_ingredients"]);
const PURCHASE_ORDER_EVIDENCE = new Set(["list_purchase_orders", "find_purchase_orders", "get_purchase_order_details"]);
const RESERVATION_EVIDENCE = new Set(["get_reservation_summary", "get_expected_guests", "list_upcoming_reservations", "find_reservations"]);

export function requiredProposalTool(message: string) {
  if (/\b(?:make|set|mark|put)\b[\s\S]{0,120}\b(?:unavailable|available|back on (?:the )?menu)\b/i.test(message)) return "propose_menu_recipe_action";
  if (/\b(?:add|remove|change|update)\b[\s\S]{0,160}\b(?:recipe|recipe ingredient|usage)\b/i.test(message)
    || /\b(?:recipe|recipe ingredient|usage)\b[\s\S]{0,160}\b(?:add|remove|change|update)\b/i.test(message)) return "propose_menu_recipe_action";
  return null;
}

export function missingRequiredEvidence(message: string, toolsUsed: string[]): string[] {
  const used = new Set(toolsUsed);
  const missing: string[] = [];
  const addIfMissing = (label: string, tools: Set<string>) => { if (![...tools].some((tool) => used.has(tool))) missing.push(label); };
  if (/\b(?:reorder|re-order|purchase order|paneer issue)\b/i.test(message)) {
    addIfMissing("inventory", INVENTORY_EVIDENCE);
    addIfMissing("existing purchase orders", PURCHASE_ORDER_EVIDENCE);
  }
  if (/\bready\s+for\s+(?:this\s+)?friday|friday\s+night\b/i.test(message)) {
    addIfMissing("reservations", RESERVATION_EVIDENCE);
    addIfMissing("inventory", INVENTORY_EVIDENCE);
    addIfMissing("existing purchase orders", PURCHASE_ORDER_EVIDENCE);
  }
  return missing;
}

export function isCollectionInterimText(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return true;
  return /^(?:perhaps |maybe |i (?:should|can|will|need to) (?:now )?(?:answer|respond)|(?:the )?collection (?:is )?complete|(?:enough|no more|no additional) (?:data|information|tools?)(?: (?:is|are) needed)?)/.test(normalized);
}

export async function runAIToolLoop(input: { provider: AIProvider; restaurant: AIRestaurantContext; history: AIConversationMessage[]; message: string; toolDefinitions: AIToolDefinition[]; executeTool: ToolExecutor; now?: Date }): Promise<AIOrchestrationResult> {
  let provider = input.provider.createSession?.() ?? input.provider;
  const messages: AIProviderMessage[] = [{ role: "system", content: buildAIManagerSystemPrompt(input.restaurant, input.now) }, ...input.history, { role: "user", content: input.message }];
  const toolsUsed: string[] = []; const activities: string[] = []; const cache = new Map<string, ToolResult>();
  const started = Date.now(); let totalCalls = 0; let providerRounds = 0; let collectionRounds = 0; let selectedModel: string | undefined; let proposalCandidate: AIProposalCandidate | undefined; let finalResponse: AIProviderResponse | undefined; let evidenceNudged = false; let proposalNudged = false;

  async function generate(tools: AIToolDefinition[], phase: "tools" | "synthesis"): Promise<AIProviderResponse> {
    const elapsed = Date.now() - started; const remaining = OVERALL_AI_TIMEOUT_MS - elapsed;
    if (remaining <= 0) throw new AIManagerError("TIMEOUT", "Overall AI request timed out.");
    providerRounds += 1; const roundStarted = Date.now();
    logAIOrchestration({ stage: "provider_start", phase, providerRound: providerRounds, collectionRounds, totalToolCalls: totalCalls, toolsEnabled: phase === "tools" && tools.length > 0, toolChoice: phase === "synthesis" ? "none" : "auto", restaurantId: input.restaurant.id, provider: provider.name });
    try {
      const response = await provider.generate({ messages, tools, toolChoice: phase === "synthesis" ? "none" : "auto", preferredModel: selectedModel, maxOutputTokens: phase === "synthesis" ? 1_000 : 700, timeoutMs: Math.min(PROVIDER_TIMEOUT_MS, remaining) });
      selectedModel = response.selectedModel ?? selectedModel;
      assertNoProviderProtocolText(response.content);
      logAIOrchestration({ stage: "provider_complete", phase, providerRound: providerRounds, collectionRounds, totalToolCalls: totalCalls, requestedToolCalls: response.toolCalls.length, textAccompaniedToolCalls: response.toolCalls.length > 0 && Boolean(response.content.trim()), finishReason: response.finishReason, selectedModel: response.selectedModel, durationMs: Date.now() - roundStarted, restaurantId: input.restaurant.id, provider: provider.name });
      return response;
    } catch (error) {
      const code = error instanceof AIManagerError ? error.code : "PROVIDER";
      logAIOrchestration({ stage: "failure", phase, reason: diagnosticReason(code), providerRound: providerRounds, totalToolCalls: totalCalls, durationMs: Date.now() - roundStarted, restaurantId: input.restaurant.id, provider: provider.name });
      throw error instanceof AIManagerError ? error : new AIManagerError("PROVIDER", "Provider request failed.");
    }
  }

  try {
    for (let toolRound = 1; toolRound <= MAX_TOOL_ROUNDS; toolRound += 1) {
      collectionRounds = toolRound;
      let response: AIProviderResponse;
      try {
        response = await generate(input.toolDefinitions, "tools");
      } catch (error) {
        if (!toolsUsed.length) throw error;
        const code = error instanceof AIManagerError ? error.code : "PROVIDER";
        logAIOrchestration({ stage: "collection_degraded", collectionRound: toolRound, reason: diagnosticReason(code), successfulTools: toolsUsed.length, restaurantId: input.restaurant.id });
        // A provider that fails during continuation must not discard already
        // verified results. Start a fresh, tool-disabled synthesis session.
        provider = input.provider.createSession?.() ?? input.provider;
        selectedModel = undefined;
        messages.push({ role: "system", content: "The tool-capable provider continuation failed. Produce a useful partial answer from successful verified tool results only, and clearly state any material domain that could not be verified." });
        break;
      }
      if (!response.toolCalls.length) {
        const requiredProposal = requiredProposalTool(input.message);
        if (requiredProposal && !proposalCandidate && !proposalNudged && toolRound < MAX_TOOL_ROUNDS) {
          proposalNudged = true;
          messages.push({ role: "system", content: `The user explicitly requested a supported controlled change. No proposal exists yet. Request the registered ${requiredProposal} tool now after using the verified read result. Do not claim a proposal was submitted unless that tool succeeds.` });
          logAIOrchestration({ stage: "collection_continued", collectionRound: toolRound, reason: "PROPOSAL_REQUIRED", toolName: requiredProposal, totalToolCalls: totalCalls, restaurantId: input.restaurant.id });
          continue;
        }
        const missing = missingRequiredEvidence(input.message, toolsUsed);
        if (missing.length && !evidenceNudged && toolRound < MAX_TOOL_ROUNDS) {
          evidenceNudged = true;
          messages.push({ role: "system", content: `Before answering, verify the missing required domains with the approved read tools: ${missing.join(", ")}. Request only the minimum useful calls, preferably together. Do not claim the data is unavailable until an applicable tool has actually failed.` });
          logAIOrchestration({ stage: "collection_continued", collectionRound: toolRound, reason: "REQUIRED_EVIDENCE_MISSING", missingDomains: missing.join(","), totalToolCalls: totalCalls, restaurantId: input.restaurant.id });
          continue;
        }
        logAIOrchestration({ stage: "collection_stopped", collectionRound: toolRound, reason: "NO_TOOL_CALLS", collectionTextAccepted: Boolean(response.content.trim() && !isCollectionInterimText(response.content)), totalToolCalls: totalCalls, restaurantId: input.restaurant.id });
        if (response.content.trim() && !isCollectionInterimText(response.content) && !(requiredProposalTool(input.message) && !proposalCandidate)) finalResponse = response;
        break;
      }
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
          catch (error) { const code = error instanceof AIManagerError ? error.code : "TOOL_FAILED"; logAIOrchestration({ stage: "tool_failed", toolName: call.name, reason: diagnosticReason(code), restaurantId: input.restaurant.id }); messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify({ error: code, message: "Tool request was rejected or unavailable." }) }); continue; }
        }
        toolsUsed.push(call.name); activities.push(result.activity);
        if (result.proposalCandidate) proposalCandidate = result.proposalCandidate;
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result.content });
      }
      if (proposalCandidate) break;
    }

    if (finalResponse) {
      const answer = validateFinalAnswer(finalResponse.content, finalResponse.selectedModel);
      logAIOrchestration({ stage: "collection_answer_accepted", collectionRounds, totalToolCalls: totalCalls, answerLength: answer.length, restaurantId: input.restaurant.id, provider: provider.name });
      return { answer, toolsUsed: [...new Set(toolsUsed)], activities: [...new Set(activities)], ...(proposalCandidate ? { proposalCandidate } : {}) };
    }

    messages.push({ role: "system", content: `Tool collection is complete. Return only the restaurant-owner-facing answer. Do not describe reasoning, planning, possible tool calls, or internal orchestration. Do not request or claim additional tool calls. Use only verified restaurant facts supplied by successful tool results. ${proposalCandidate ? "A server-validated proposal was created and may be described as awaiting approval." : "No server-validated proposal was created. Do not claim that a proposal was submitted, prepared, registered, or is awaiting approval."} ${toolsUsed.length ? "Clearly distinguish facts, inferences, and recommendations." : "No restaurant data tool succeeded, so do not make restaurant-specific factual claims; clearly say that verified restaurant data was unavailable for this answer."}` });
    logAIOrchestration({ stage: "synthesis_started", collectionRounds, totalToolCalls: totalCalls, successfulTools: toolsUsed.length, restaurantId: input.restaurant.id, provider: provider.name });
    // Do not send function declarations during synthesis. Some compatible
    // providers ignore tool_choice=none when declarations remain present.
    let synthesis = await generate([], "synthesis");
    if (synthesis.toolCalls.length || !synthesis.content.trim()) {
      messages.push({ role: "system", content: "Your previous synthesis response was invalid. Answer now using the verified tool results already in this transcript. Return plain owner-facing text only; no function calls, tool markup, JSON envelopes, or internal protocol." });
      synthesis = await generate([], "synthesis");
    }
    if (synthesis.toolCalls.length) throw new AIManagerError("TOOL_ROUND_LIMIT", "Provider requested tools during disabled final synthesis.");
    const answer = validateFinalAnswer(synthesis.content, synthesis.selectedModel);
    logAIOrchestration({ stage: "synthesis_completed", collectionRounds, totalToolCalls: totalCalls, answerLength: answer.length, restaurantId: input.restaurant.id, provider: provider.name });
    return { answer, toolsUsed: [...new Set(toolsUsed)], activities: [...new Set(activities)], ...(proposalCandidate ? { proposalCandidate } : {}) };
  } catch (error) {
    const code = error instanceof AIManagerError ? error.code : "PROVIDER";
    logAIOrchestration({ stage: "request_failed", reason: diagnosticReason(code), providerRounds, totalToolCalls: totalCalls, durationMs: Date.now() - started, restaurantId: input.restaurant.id, provider: provider.name });
    throw error;
  }
}
