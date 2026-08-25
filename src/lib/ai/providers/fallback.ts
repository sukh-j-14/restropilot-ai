import { AIManagerError } from "@/lib/ai/errors";
import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import type { AIProvider, AIProviderRequest } from "@/lib/ai/types";

const FALLBACK_CODES = new Set(["CONFIGURATION", "PROVIDER", "TIMEOUT", "RATE_LIMIT", "INVALID_RESPONSE"]);

export function createFallbackProvider(primary: AIProvider, fallback: AIProvider): AIProvider {
  const provider: AIProvider = {
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
    createSession() {
      const primarySession = primary.createSession?.() ?? primary;
      const fallbackSession = fallback.createSession?.() ?? fallback;
      let selected: "primary" | "fallback" | undefined;
      let selectedModel: string | undefined;
      return {
        name: provider.name,
        async generate(request) {
          if (selected === "fallback") {
            const response = await fallbackSession.generate({ ...request, preferredModel: selectedModel });
            selectedModel = response.selectedModel ?? selectedModel;
            return response;
          }
          try {
            const response = await primarySession.generate({ ...request, preferredModel: selectedModel });
            selected = "primary";
            selectedModel = response.selectedModel ?? selectedModel;
            return response;
          } catch (error) {
            if (!(error instanceof AIManagerError) || !FALLBACK_CODES.has(error.code)) throw error;
            logAIOrchestration({ stage: "provider_fallback_started", primaryProvider: primary.name, fallbackProvider: fallback.name, primaryFailure: diagnosticReason(error.code) });
            try {
              // A primary-provider model identifier must not cross providers.
              const response = await fallbackSession.generate({ ...request, preferredModel: undefined });
              selected = "fallback";
              selectedModel = response.selectedModel;
              logAIOrchestration({ stage: "provider_fallback_succeeded", primaryProvider: primary.name, fallbackProvider: fallback.name, selectedModel });
              return response;
            } catch (fallbackError) {
              const fallbackCode = fallbackError instanceof AIManagerError ? fallbackError.code : "PROVIDER";
              logAIOrchestration({ stage: "provider_fallback_failed", primaryProvider: primary.name, fallbackProvider: fallback.name, primaryFailure: diagnosticReason(error.code), fallbackFailure: diagnosticReason(fallbackCode) });
              throw fallbackError;
            }
          }
        },
      };
    },
  };
  return provider;
}
