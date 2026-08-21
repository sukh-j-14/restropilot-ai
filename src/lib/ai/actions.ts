"use server";

import { askAIManager } from "@/lib/ai/manager";
import { safeAIErrorMessage } from "@/lib/ai/errors";
import { AIManagerError } from "@/lib/ai/errors";
import { diagnosticReason, logAIOrchestration } from "@/lib/ai/diagnostics";
import type { AIConversationMessage } from "@/lib/ai/types";
import { getCurrentRestaurant } from "@/lib/services/tenant";
import { auth } from "@clerk/nextjs/server";

export type AIManagerActionResult = { success: true; answer: string; toolsUsed: string[]; activities: string[]; actionProposal?: import("@/lib/ai/action-proposal-types").AIActionProposal | null } | { success: false; message: string; clearHistory?: boolean };
export async function requestAIManager(input: { message: string; history: AIConversationMessage[] }): Promise<AIManagerActionResult> {
  try {
    const restaurant = await getCurrentRestaurant();
    if (!restaurant) return { success: false, message: "Restaurant setup is required before using AI Manager." };
    const { userId } = await auth();
    if (!userId) return { success: false, message: "Please sign in to use AI Manager." };
    const result = await askAIManager({ request: input, clerkUserId: userId, restaurant: { id: restaurant.id, name: restaurant.name, timezone: restaurant.timezone, currency: restaurant.currency, guestCapacity: restaurant.guestCapacity } });
    return { success: true, ...result };
  } catch (error) {
    const code = error instanceof AIManagerError ? error.code : "PROVIDER";
    logAIOrchestration({ stage: "action_failed", reason: diagnosticReason(code) });
    return { success: false, message: safeAIErrorMessage(error), clearHistory: error instanceof AIManagerError && error.code === "INVALID_HISTORY" };
  }
}
