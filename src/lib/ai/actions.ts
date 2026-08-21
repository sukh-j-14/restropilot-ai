"use server";

import { askAIManager } from "@/lib/ai/manager";
import { safeAIErrorMessage } from "@/lib/ai/errors";
import { AIManagerError } from "@/lib/ai/errors";
import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import type { AIConversationMessage } from "@/lib/ai/types";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export type AIManagerActionResult = { success: true; answer: string; toolsUsed: string[]; activities: string[] } | { success: false; message: string; clearHistory?: boolean };
export async function requestAIManager(input: { message: string; history: AIConversationMessage[] }): Promise<AIManagerActionResult> {
  try {
    const restaurant = await getCurrentRestaurant();
    if (!restaurant) return { success: false, message: "Restaurant setup is required before using AI Manager." };
    const result = await askAIManager({ request: input, restaurant: { id: restaurant.id, name: restaurant.name, timezone: restaurant.timezone, currency: restaurant.currency, guestCapacity: restaurant.guestCapacity } });
    return { success: true, ...result };
  } catch (error) {
    const code = error instanceof AIManagerError ? error.code : "PROVIDER";
    logAIOrchestration({ stage: "action_failed", reason: diagnosticReason(code) });
    return { success: false, message: safeAIErrorMessage(error), clearHistory: error instanceof AIManagerError && error.code === "INVALID_HISTORY" };
  }
}
