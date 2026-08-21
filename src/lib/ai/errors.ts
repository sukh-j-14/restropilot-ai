export type AIErrorCode = "CONFIGURATION" | "PROVIDER" | "TIMEOUT" | "RATE_LIMIT" | "INVALID_RESPONSE" | "INVALID_REQUEST" | "INVALID_HISTORY" | "INVALID_TOOL" | "TOOL_FAILED" | "LOOP_LIMIT" | "TOOL_ROUND_LIMIT" | "TOOL_CALL_LIMIT" | "MALFORMED_TOOL_CALL" | "FINAL_RESPONSE_MISSING";

export class AIManagerError extends Error {
  constructor(public readonly code: AIErrorCode, message: string) { super(message); this.name = "AIManagerError"; }
}

export function safeAIErrorMessage(error: unknown) {
  if (!(error instanceof AIManagerError)) return "The AI Manager could not complete that request. Please try again.";
  switch (error.code) {
    case "CONFIGURATION": return "AI Manager is not configured yet. Please contact your workspace administrator.";
    case "TIMEOUT": return "The AI service took too long to respond. Please try again.";
    case "RATE_LIMIT": return "AI Manager is receiving too many requests. Please wait a moment and try again.";
    case "INVALID_REQUEST": return error.message;
    case "INVALID_HISTORY": return "Conversation history is invalid. Clear the conversation and try again.";
    case "LOOP_LIMIT":
    case "TOOL_ROUND_LIMIT":
    case "TOOL_CALL_LIMIT":
    case "FINAL_RESPONSE_MISSING": return "I gathered restaurant data but couldn't complete the analysis. Try asking a more specific question.";
    default: return "The AI Manager could not safely complete that request. Please try again.";
  }
}
