import "server-only";

import { resolveProviderConfiguration, type ProviderName } from "@/lib/ai/provider-config";
import type { AIProvider } from "@/lib/ai/types";
import { createFallbackProvider } from "@/lib/ai/providers/fallback";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenRouterProvider } from "@/lib/ai/providers/openrouter";

function createProvider(name: ProviderName, environment: NodeJS.ProcessEnv) {
  return name === "gemini" ? createGeminiProvider(environment) : createOpenRouterProvider(environment);
}

export function getAIProvider(environment: NodeJS.ProcessEnv = process.env): AIProvider {
  const { primary: primaryName, fallback: fallbackName } = resolveProviderConfiguration(environment);
  const primary = createProvider(primaryName, environment);
  if (!fallbackName || fallbackName === primaryName) return primary;
  return createFallbackProvider(primary, createProvider(fallbackName, environment));
}
