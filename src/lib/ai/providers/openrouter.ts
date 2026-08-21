import "server-only";

import { AIManagerError } from "@/lib/ai/errors";
import type { AIProvider, AIProviderMessage, AIProviderRequest, AIProviderResponse } from "@/lib/ai/types";

type OpenRouterToolCall = { id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } };
type OpenRouterResponse = { model?: unknown; choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown; tool_calls?: unknown } }> };

function providerMessage(message: AIProviderMessage) {
  if (message.role === "tool") return { role: "tool", content: message.content, tool_call_id: message.toolCallId, name: message.name };
  if (message.role === "assistant") return { role: "assistant", content: message.content, ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) } : {}) };
  return message;
}

function translateResponse(payload: unknown): AIProviderResponse {
  if (!payload || typeof payload !== "object") throw new AIManagerError("INVALID_RESPONSE", "Provider returned an invalid response.");
  const choice = (payload as OpenRouterResponse).choices?.[0]; const message = choice?.message;
  if (!message || typeof message !== "object") throw new AIManagerError("INVALID_RESPONSE", "Provider response did not contain a message.");
  const rawCalls = message.tool_calls;
  if (rawCalls !== undefined && !Array.isArray(rawCalls)) throw new AIManagerError("INVALID_RESPONSE", "Provider returned malformed tool calls.");
  const toolCalls = (rawCalls as OpenRouterToolCall[] | undefined ?? []).map((call) => {
    if (!call || typeof call.id !== "string" || call.type !== "function" || typeof call.function?.name !== "string" || typeof call.function.arguments !== "string") throw new AIManagerError("INVALID_RESPONSE", "Provider returned a malformed tool call.");
    return { id: call.id, name: call.function.name, arguments: call.function.arguments };
  });
  const finish = choice?.finish_reason;
  const finishReason = finish === "stop" || finish === "tool_calls" || finish === "length" || finish === "error" ? finish : "unknown";
  const selectedModel = (payload as OpenRouterResponse).model;
  return { content: typeof message.content === "string" ? message.content : "", toolCalls, finishReason, selectedModel: typeof selectedModel === "string" ? selectedModel : undefined };
}

export function createOpenRouterProvider(environment: NodeJS.ProcessEnv = process.env): AIProvider {
  const apiKey = environment.OPENROUTER_API_KEY; const model = environment.OPENROUTER_MODEL;
  if (!apiKey || !model) throw new AIManagerError("CONFIGURATION", "OpenRouter configuration is incomplete.");
  return {
    name: "openrouter",
    async generate(request: AIProviderRequest) {
      let response: Response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "RestroPilot AI" },
          body: JSON.stringify({ model, messages: request.messages.map(providerMessage), ...(request.tools.length ? { tools: request.tools.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto", parallel_tool_calls: true } : {}), temperature: 0.2, max_completion_tokens: request.maxOutputTokens, stream: false }),
          signal: AbortSignal.timeout(request.timeoutMs),
        });
      } catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new AIManagerError("TIMEOUT", "Provider request timed out.");
        throw new AIManagerError("PROVIDER", "Provider request failed.");
      }
      if (!response.ok) {
        if (response.status === 429) throw new AIManagerError("RATE_LIMIT", "Provider rate limit reached.");
        if (response.status === 408 || response.status === 504) throw new AIManagerError("TIMEOUT", "Provider request timed out.");
        throw new AIManagerError("PROVIDER", `Provider request failed with status ${response.status}.`);
      }
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new AIManagerError("INVALID_RESPONSE", "Provider returned invalid JSON."); }
      return translateResponse(payload);
    },
  };
}
