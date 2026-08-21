import { AIManagerError } from "@/lib/ai/errors";
import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import type { AIProvider, AIProviderRequest } from "@/lib/ai/types";

const FALLBACK_CODES = new Set(["CONFIGURATION", "PROVIDER", "TIMEOUT", "RATE_LIMIT", "INVALID_RESPONSE"]);

export function createFallbackProvider(primary: AIProvider, fallback: AIProvider): AIProvider {
  return {
    name: `${primary.name}+${fallback.name}-fallback`,
    async generate(request: AIProviderRequest) {
      try {
        return await primary.generate(request);
      } catch (error) {
        if (!(error instanceof AIManagerError) || !FALLBACK_CODES.has(error.code)) throw error;
        logAIOrchestration({
          stage: "provider_fallback_started",
          primaryProvider: primary.name,
          fallbackProvider: fallback.name,
          primaryFailure: diagnosticReason(error.code),
        });
        // Provider-specific model identifiers must never leak across providers.
        try {
          const response = await fallback.generate({ ...request, preferredModel: undefined });
          logAIOrchestration({ stage: "provider_fallback_succeeded", primaryProvider: primary.name, fallbackProvider: fallback.name });
          return response;
        } catch (fallbackError) {
          const fallbackCode = fallbackError instanceof AIManagerError ? fallbackError.code : "PROVIDER";
          logAIOrchestration({
            stage: "provider_fallback_failed",
            primaryProvider: primary.name,
            fallbackProvider: fallback.name,
            primaryFailure: diagnosticReason(error.code),
            fallbackFailure: diagnosticReason(fallbackCode),
          });
          throw fallbackError;
        }
      }
    },
  };
}
