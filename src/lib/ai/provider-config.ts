import { AIManagerError } from "@/lib/ai/errors";

export type ProviderName = "gemini" | "openrouter";

export function parseProviderName(value: string | undefined, variable: string): ProviderName | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "gemini" || normalized === "openrouter") return normalized;
  throw new AIManagerError("CONFIGURATION", `${variable} is unsupported.`);
}

export function resolveProviderConfiguration(environment: NodeJS.ProcessEnv) {
  return {
    primary: parseProviderName(environment.AI_PROVIDER, "AI_PROVIDER") ?? "openrouter",
    fallback: parseProviderName(environment.AI_FALLBACK_PROVIDER, "AI_FALLBACK_PROVIDER"),
  };
}
