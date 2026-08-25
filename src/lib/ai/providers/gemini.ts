import "server-only";

import { request as httpsRequest } from "node:https";
import { logAIOrchestration } from "@/lib/ai/diagnostics";
import { AIManagerError } from "@/lib/ai/errors";
import { assertNoProviderProtocolText } from "@/lib/ai/provider-protocol";
import type { AIProvider, AIProviderMessage, AIProviderRequest, AIProviderResponse } from "@/lib/ai/types";

type GeminiPart = { text?: unknown; thought?: unknown; thoughtSignature?: unknown; functionCall?: { id?: unknown; name?: unknown; args?: unknown } };
type GeminiResponse = { candidates?: Array<{ finishReason?: unknown; content?: { parts?: GeminiPart[] } }> };
type GeminiContent = { role: "user" | "model"; parts: Array<Record<string, unknown>> };
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;

export function classifyGeminiHTTPError(payload: unknown): string {
  const error = payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : undefined;
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  if (/function|tool|schema|parameter/.test(message)) return "INVALID_TOOL_REQUEST";
  if (/thought|thinking/.test(message)) return "INVALID_THINKING_CONFIG";
  if (/model/.test(message)) return "INVALID_MODEL";
  return typeof record.status === "string" ? record.status : "HTTP_ERROR";
}

function safeJSON(value: string, fallback: Record<string, unknown>) {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : fallback;
  } catch { return fallback; }
}

export function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiSchema);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const nullableType = Array.isArray(record.type) && record.type.length === 2 && record.type.includes("null")
    ? record.type.find((item) => item !== "null")
    : undefined;
  return Object.fromEntries(Object.entries(record)
    // Gemini FunctionDeclaration accepts a selected OpenAPI Schema subset.
    // Keep stricter rules in server validation when a keyword is unsupported.
    .filter(([key]) => key !== "additionalProperties" && key !== "exclusiveMinimum" && key !== "exclusiveMaximum" && !(key === "type" && nullableType))
    .map(([key, item]) => [key, toGeminiSchema(item)])
    .concat(nullableType ? [["type", nullableType], ["nullable", true]] : []));
}

function toGeminiContents(messages: AIProviderMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents: GeminiContent[] = [];
  function append(role: GeminiContent["role"], parts: GeminiContent["parts"]) {
    const previous = contents.at(-1);
    if (previous?.role === role) previous.parts.push(...parts);
    else contents.push({ role, parts });
  }
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") append("user", [{ text: message.content }]);
    else if (message.role === "assistant") {
      const parts: GeminiContent["parts"] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) parts.push({
        functionCall: { id: call.id, name: call.name, args: safeJSON(call.arguments, {}) },
        ...(call.providerMetadata?.geminiThoughtSignature ? { thoughtSignature: call.providerMetadata.geminiThoughtSignature } : {}),
      });
      if (parts.length) append("model", parts);
    } else if (message.role === "tool") append("user", [{ functionResponse: { id: message.toolCallId, name: message.name, response: safeJSON(message.content, { result: message.content }) } }]);
  }
  return { system, contents };
}

async function postGeminiJSON(apiKey: string, model: string, body: string, timeoutMs: number): Promise<{ status: number; payload?: unknown }> {
  const modelName = model.replace(/^models\//, "");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
  return new Promise((resolve, reject) => {
    const request = httpsRequest(endpoint, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Connection: "close" },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_PROVIDER_RESPONSE_BYTES) return response.destroy(new AIManagerError("INVALID_RESPONSE", "Gemini response exceeded the safe size limit."));
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        const status = response.statusCode ?? 500;
        const content = Buffer.concat(chunks).toString("utf8");
        if (!content) return resolve({ status });
        try { resolve({ status, payload: JSON.parse(content) }); }
        catch { reject(new AIManagerError("INVALID_RESPONSE", "Gemini returned invalid JSON.")); }
      });
    });
    const deadline = setTimeout(() => request.destroy(new DOMException("Gemini request timed out.", "TimeoutError")), timeoutMs);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", reject);
    request.end(body);
  });
}

function translateResponse(payload: unknown, model: string, nextCallId: () => string): AIProviderResponse {
  if (!payload || typeof payload !== "object") throw new AIManagerError("INVALID_RESPONSE", "Gemini returned an invalid response.");
  const candidate = (payload as GeminiResponse).candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!candidate || !Array.isArray(parts)) throw new AIManagerError("INVALID_RESPONSE", "Gemini response did not contain a candidate.");
  const content = assertNoProviderProtocolText(parts.flatMap((part) => typeof part.text === "string" && part.thought !== true ? [part.text] : []).join(""));
  const toolCalls = parts.flatMap((part) => {
    const call = part.functionCall;
    if (!call) return [];
    if (typeof call.name !== "string" || !call.args || typeof call.args !== "object" || Array.isArray(call.args)) throw new AIManagerError("INVALID_RESPONSE", "Gemini returned a malformed function call.");
    return [{
      id: typeof call.id === "string" && call.id ? call.id : nextCallId(),
      name: call.name,
      arguments: JSON.stringify(call.args),
      ...(typeof part.thoughtSignature === "string" ? { providerMetadata: { geminiThoughtSignature: part.thoughtSignature } } : {}),
    }];
  });
  const finish = candidate.finishReason;
  const finishReason = toolCalls.length ? "tool_calls" : finish === "STOP" ? "stop" : finish === "MAX_TOKENS" ? "length" : finish === "MALFORMED_FUNCTION_CALL" ? "error" : "unknown";
  return { content, toolCalls, finishReason, selectedModel: model };
}

export function createGeminiProvider(environment: NodeJS.ProcessEnv = process.env): AIProvider {
  const apiKey = environment.GEMINI_API_KEY;
  const model = environment.GEMINI_MODEL;
  if (!apiKey || !model) throw new AIManagerError("CONFIGURATION", "Gemini configuration is incomplete.");
  let callSequence = 0;
  return {
    name: "gemini",
    async generate(request: AIProviderRequest) {
      const { system, contents } = toGeminiContents(request.messages);
      const body = JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        ...(request.tools.length ? {
          tools: [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: toGeminiSchema(tool.parameters) })) }],
          toolConfig: { functionCallingConfig: { mode: request.toolChoice === "none" ? "NONE" : "AUTO" } },
        } : {}),
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          thinkingConfig: model.includes("2.5") ? { thinkingBudget: 0 } : { thinkingLevel: model.includes("flash-lite") ? "MINIMAL" : "LOW" },
        },
      });
      let response: { status: number; payload?: unknown };
      try { response = await postGeminiJSON(apiKey, model, body, request.timeoutMs); }
      catch (error) {
        if (error instanceof AIManagerError) throw error;
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new AIManagerError("TIMEOUT", "Gemini request timed out.");
        throw new AIManagerError("PROVIDER", "Gemini request failed.");
      }
      if (response.status < 200 || response.status >= 300) {
        logAIOrchestration({ stage: "provider_http_error", provider: "gemini", status: response.status, category: classifyGeminiHTTPError(response.payload) });
        if (response.status === 429) throw new AIManagerError("RATE_LIMIT", "Gemini rate limit reached.");
        if (response.status === 408 || response.status === 504) throw new AIManagerError("TIMEOUT", "Gemini request timed out.");
        throw new AIManagerError("PROVIDER", `Gemini request failed: ${classifyGeminiHTTPError(response.payload)}.`);
      }
      return translateResponse(response.payload, model, () => `gemini-call-${++callSequence}`);
    },
  };
}
