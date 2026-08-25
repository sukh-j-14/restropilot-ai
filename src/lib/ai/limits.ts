import { AIManagerError } from "@/lib/ai/errors";
import type { AIConversationMessage } from "@/lib/ai/types";

export const MAX_USER_MESSAGE_LENGTH = 1_500;
export const MAX_ASSISTANT_MESSAGE_LENGTH = 8_000;
export const MAX_HISTORY_MESSAGES = 10;
// Cross-domain briefings and evidence-backed proposals commonly need four
// sequential decisions (resolve resource, inspect state, check conflicts,
// propose). Keep the loop bounded while allowing those workflows to finish.
export const MAX_TOOL_ROUNDS = 5;
export const MAX_TOOL_CALLS = 12;
export const PROVIDER_TIMEOUT_MS = 45_000;
export const OVERALL_AI_TIMEOUT_MS = 120_000;

export function validateConversationInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_REQUEST", "Request is malformed.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["message", "history"].includes(key))) throw new AIManagerError("INVALID_REQUEST", "Request contains unsupported fields.");
  if (typeof record.message !== "string" || !record.message.trim()) throw new AIManagerError("INVALID_REQUEST", "Enter a question for AI Manager.");
  if (record.message.length > MAX_USER_MESSAGE_LENGTH) throw new AIManagerError("INVALID_REQUEST", `Questions must be ${MAX_USER_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`);
  if (!Array.isArray(record.history) || record.history.length > 50) throw new AIManagerError("INVALID_HISTORY", "History must be a bounded array.");
  const history: AIConversationMessage[] = record.history.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message) || Object.getPrototypeOf(message) !== Object.prototype) throw new AIManagerError("INVALID_HISTORY", "History entries must be plain objects.");
    const item = message as Record<string, unknown>;
    if (Object.keys(item).some((key) => !["role", "content"].includes(key)) || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string" || !item.content.trim()) throw new AIManagerError("INVALID_HISTORY", "History entries must contain only role and non-empty content.");
    const maximum = item.role === "user" ? MAX_USER_MESSAGE_LENGTH : MAX_ASSISTANT_MESSAGE_LENGTH;
    if (item.content.length > maximum) throw new AIManagerError("INVALID_HISTORY", "History entry exceeds its role-specific limit.");
    return { role: item.role, content: item.content };
  });
  return { message: record.message.trim(), history: history.slice(-MAX_HISTORY_MESSAGES) };
}

// Development-only process-local throttle. A distributed deployment needs a shared rate limiter.
const requests = new Map<string, number[]>();
export function checkInMemoryThrottle(key: string, now = Date.now()) {
  const recent = (requests.get(key) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 8) throw new AIManagerError("RATE_LIMIT", "Too many AI requests.");
  recent.push(now); requests.set(key, recent);
}
export function resetInMemoryThrottle() { requests.clear(); }
