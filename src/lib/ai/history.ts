import { MAX_ASSISTANT_MESSAGE_LENGTH, MAX_HISTORY_MESSAGES, MAX_USER_MESSAGE_LENGTH } from "@/lib/ai/limits";
import type { AIConversationMessage } from "@/lib/ai/types";

export function buildBrowserConversationHistory(messages: unknown[]): AIConversationMessage[] {
  const history: AIConversationMessage[] = [];
  for (const value of messages) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    if (item.error === true || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string" || !item.content.trim()) continue;
    const maximum = item.role === "user" ? MAX_USER_MESSAGE_LENGTH : MAX_ASSISTANT_MESSAGE_LENGTH;
    if (item.content.length > maximum) continue;
    history.push({ role: item.role, content: item.content });
  }
  return history.slice(-MAX_HISTORY_MESSAGES);
}
