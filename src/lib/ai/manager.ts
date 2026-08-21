import "server-only";

import { checkInMemoryThrottle, validateConversationInput } from "@/lib/ai/limits";
import { runAIToolLoop } from "@/lib/ai/orchestrator";
import { getAIProvider } from "@/lib/ai/provider";
import { executeReadOnlyTool, getReadOnlyToolDefinitions, getToolActivity } from "@/lib/ai/tools";
import { persistPurchaseOrderProposal, preparePurchaseOrderProposal } from "@/lib/services/ai-action-proposals";
import { PURCHASE_ORDER_PROPOSAL_TOOL, purchaseOrderProposalToolDefinition, validatePurchaseOrderProposalTool } from "@/lib/ai/proposal-tool";
import type { AIRestaurantContext } from "@/lib/ai/types";

export async function askAIManager(input: { request: unknown; restaurant: AIRestaurantContext; clerkUserId: string }) {
  const validated = validateConversationInput(input.request);
  checkInMemoryThrottle(input.restaurant.id);
  const result = await runAIToolLoop({
    provider: getAIProvider(), restaurant: input.restaurant, history: validated.history, message: validated.message,
    toolDefinitions: [...getReadOnlyToolDefinitions(), purchaseOrderProposalToolDefinition],
    executeTool: async ({ name, arguments: args, restaurant }) => {
      if (name === PURCHASE_ORDER_PROPOSAL_TOOL) {
        const candidate = validatePurchaseOrderProposalTool(args);
        await preparePurchaseOrderProposal({ restaurantId: restaurant.id, candidate });
        return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a purchase recommendation...", proposalCandidate: candidate };
      }
      return { content: await executeReadOnlyTool({ name, arguments: args, context: { restaurant } }), activity: getToolActivity(name) };
    },
  });
  const actionProposal = result.proposalCandidate ? await persistPurchaseOrderProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await preparePurchaseOrderProposal({ restaurantId: input.restaurant.id, candidate: result.proposalCandidate }) }) : null;
  return { answer: result.answer, toolsUsed: result.toolsUsed.filter((name) => name !== PURCHASE_ORDER_PROPOSAL_TOOL), activities: result.activities, actionProposal };
}
