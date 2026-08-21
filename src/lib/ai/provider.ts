import "server-only";

import type { AIProvider } from "@/lib/ai/types";
import { createOpenRouterProvider } from "@/lib/ai/providers/openrouter";

export function getAIProvider(): AIProvider {
  return createOpenRouterProvider();
}
