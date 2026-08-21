import "server-only";

import { checkInMemoryThrottle, validateConversationInput } from "@/lib/ai/limits";
import { runAIToolLoop } from "@/lib/ai/orchestrator";
import { getAIProvider } from "@/lib/ai/provider";
import { executeReadOnlyTool, getReadOnlyToolDefinitions, getToolActivity } from "@/lib/ai/tools";
import type { AIRestaurantContext } from "@/lib/ai/types";

export async function askAIManager(input: { request: unknown; restaurant: AIRestaurantContext }) {
  const validated = validateConversationInput(input.request);
  checkInMemoryThrottle(input.restaurant.id);
  return runAIToolLoop({
    provider: getAIProvider(), restaurant: input.restaurant, history: validated.history, message: validated.message,
    toolDefinitions: getReadOnlyToolDefinitions(),
    executeTool: async ({ name, arguments: args, restaurant }) => ({ content: await executeReadOnlyTool({ name, arguments: args, context: { restaurant } }), activity: getToolActivity(name) }),
  });
}
