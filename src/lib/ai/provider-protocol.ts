import { AIManagerError } from "@/lib/ai/errors";

// Some OpenAI-compatible gateways occasionally serialize their private tool
// protocol into message text instead of returning a structured tool call.
// Textual protocol is never executable and must never become assistant copy.
const PROVIDER_PROTOCOL_PATTERNS = [
  /<\/?dots_function_call\b/i,
  /<invoke\s+name\s*=/i,
  /<\/?function_call\b/i,
  /<\/?tool_call\b/i,
  /<\/?tool_calls\b/i,
  /<tool_use\b/i,
];

export function containsProviderProtocolText(value: string) {
  return PROVIDER_PROTOCOL_PATTERNS.some((pattern) => pattern.test(value));
}

export function assertNoProviderProtocolText(value: string) {
  if (containsProviderProtocolText(value)) {
    throw new AIManagerError("INVALID_RESPONSE", "Provider returned tool protocol as visible text.");
  }
  return value;
}

export function safeAssistantDisplayText(value: string) {
  return containsProviderProtocolText(value)
    ? "The AI response used an invalid internal format and was not displayed. Please try again."
    : value;
}
