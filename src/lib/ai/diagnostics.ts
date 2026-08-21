import type { AIErrorCode } from "@/lib/ai/errors";

const reasonByCode: Partial<Record<AIErrorCode, string>> = {
  TIMEOUT: "PROVIDER_TIMEOUT", RATE_LIMIT: "PROVIDER_RATE_LIMIT", TOOL_ROUND_LIMIT: "TOOL_ROUND_LIMIT", TOOL_CALL_LIMIT: "TOOL_CALL_LIMIT",
  INVALID_RESPONSE: "INVALID_PROVIDER_RESPONSE", MALFORMED_TOOL_CALL: "MALFORMED_TOOL_CALL", PROVIDER: "PROVIDER_ERROR", FINAL_RESPONSE_MISSING: "FINAL_RESPONSE_MISSING",
};

export function diagnosticReason(code: AIErrorCode) { return reasonByCode[code] ?? code; }

export function logAIOrchestration(event: Record<string, string | number | boolean | undefined>) {
  console.info(JSON.stringify({ event: "ai_orchestration", timestamp: new Date().toISOString(), ...event }));
}
