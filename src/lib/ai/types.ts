export type AIConversationMessage = { role: "user" | "assistant"; content: string };
export type AIToolCall = {
  id: string;
  name: string;
  arguments: string;
  /** Request-local provider state. Never return this through browser history. */
  providerMetadata?: { geminiThoughtSignature?: string };
};
export type AIProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AIToolCall[] }
  | { role: "tool"; content: string; toolCallId: string; name: string };

export type JSONSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
export type AIToolDefinition = { name: string; description: string; parameters: JSONSchema };
export type AIProviderRequest = { messages: AIProviderMessage[]; tools: AIToolDefinition[]; toolChoice: "auto" | "none"; preferredModel?: string; maxOutputTokens: number; timeoutMs: number };
export type AIProviderResponse = { content: string; toolCalls: AIToolCall[]; finishReason: "stop" | "tool_calls" | "length" | "error" | "unknown"; selectedModel?: string };

export interface AIProvider {
  readonly name: string;
  generate(request: AIProviderRequest): Promise<AIProviderResponse>;
  /** Isolates provider/model affinity to one orchestration request. */
  createSession?(): AIProvider;
  stream?(request: AIProviderRequest): AsyncIterable<string>;
}

export type AIRestaurantContext = { id: string; name: string; timezone: string; currency: string; guestCapacity: number | null };
import type { AIActionProposal, AIProposalCandidate } from "@/lib/ai/action-proposal-types";
export type AIManagerResult = { answer: string; toolsUsed: string[]; activities: string[]; actionProposal?: AIActionProposal | null };
export type AIOrchestrationResult = Omit<AIManagerResult, "actionProposal"> & { proposalCandidate?: AIProposalCandidate };
