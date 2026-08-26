import "server-only";

import { checkInMemoryThrottle, validateConversationInput } from "@/lib/ai/limits";
import { runAIToolLoop } from "@/lib/ai/orchestrator";
import { getAIProvider } from "@/lib/ai/provider";
import { executeReadOnlyTool, getReadOnlyToolDefinitions, getToolActivity } from "@/lib/ai/tools";
import { persistPurchaseOrderProposal, preparePurchaseOrderProposal } from "@/lib/services/ai-action-proposals";
import { PURCHASE_ORDER_PROPOSAL_TOOL, purchaseOrderProposalToolDefinition, validatePurchaseOrderProposalTool } from "@/lib/ai/proposal-tool";
import { MENU_RECIPE_PROPOSAL_TOOL, menuRecipeProposalToolDefinition, validateMenuRecipeProposalTool } from "@/lib/ai/menu-recipe-proposal-tool";
import { persistMenuRecipeProposal, prepareMenuRecipeProposal } from "@/lib/services/ai-menu-recipe-actions";
import { INVENTORY_PROPOSAL_TOOL, inventoryProposalToolDefinition, validateInventoryProposalIntent, validateInventoryProposalTool } from "@/lib/ai/inventory-proposal-tool";
import { persistInventoryProposal, prepareInventoryProposal } from "@/lib/services/ai-inventory-actions";
import { SUPPLIER_PROPOSAL_TOOL, supplierProposalToolDefinition, validateSupplierProposalTool } from "@/lib/ai/supplier-proposal-tool";
import { persistSupplierProposal, prepareSupplierProposal } from "@/lib/services/ai-supplier-actions";
import { RESERVATION_PROPOSAL_TOOL, reservationProposalToolDefinition, validateReservationProposalTool } from "@/lib/ai/reservation-proposal-tool";
import { persistReservationProposal, prepareReservationProposal } from "@/lib/services/ai-reservation-actions";
import { ORDER_PROPOSAL_TOOL, orderProposalToolDefinition, validateOrderProposalTool } from "@/lib/ai/order-proposal-tool";
import { persistOrderProposal, prepareOrderProposal } from "@/lib/services/ai-order-actions";
import { RESTAURANT_SETTINGS_PROPOSAL_TOOL, restaurantSettingsProposalToolDefinition, validateRestaurantSettingsProposalTool } from "@/lib/ai/restaurant-settings-proposal-tool";
import { persistRestaurantSettingsProposal, prepareRestaurantSettingsProposal } from "@/lib/services/ai-restaurant-settings-actions";
import { PURCHASE_ORDER_STATUS_PROPOSAL_TOOL, purchaseOrderStatusProposalToolDefinition, validatePurchaseOrderStatusProposalTool } from "@/lib/ai/purchase-order-status-proposal-tool";
import { persistPurchaseOrderStatusProposal, preparePurchaseOrderStatusProposal } from "@/lib/services/ai-purchase-order-status-actions";
import type { AIRestaurantContext } from "@/lib/ai/types";
import type { AIProposalCandidate, OrderProposalCandidate, PurchaseOrderProposalCandidate, PurchaseOrderStatusProposalCandidate, ReservationProposalCandidate, RestaurantSettingsProposalCandidate, SupplierProposalCandidate } from "@/lib/ai/action-proposal-types";
import { containsBrowserSuppliedTenantIdentity } from "@/lib/ai/tenant-input-policy";

function isSupplierCandidate(candidate: AIProposalCandidate): candidate is SupplierProposalCandidate { return "actionType" in candidate && (candidate.actionType === "CREATE_SUPPLIER" || candidate.actionType === "UPDATE_SUPPLIER"); }
function isPurchaseOrderCandidate(candidate: AIProposalCandidate): candidate is PurchaseOrderProposalCandidate { return !("actionType" in candidate) && "supplierName" in candidate; }
function isReservationCandidate(candidate: AIProposalCandidate): candidate is ReservationProposalCandidate { return "actionType" in candidate && ["CREATE_RESERVATION", "UPDATE_RESERVATION", "TRANSITION_RESERVATION_STATUS"].includes(candidate.actionType); }
function isOrderCandidate(candidate: AIProposalCandidate): candidate is OrderProposalCandidate { return "actionType" in candidate && ["CREATE_ORDER", "UPDATE_ORDER_ITEMS", "TRANSITION_ORDER_STATUS"].includes(candidate.actionType); }
function isRestaurantSettingsCandidate(candidate: AIProposalCandidate): candidate is RestaurantSettingsProposalCandidate { return "actionType" in candidate && candidate.actionType === "UPDATE_RESTAURANT_SETTINGS"; }
function isPurchaseOrderStatusCandidate(candidate: AIProposalCandidate): candidate is PurchaseOrderStatusProposalCandidate { return "actionType" in candidate && candidate.actionType === "TRANSITION_PURCHASE_ORDER_STATUS"; }

export function getAIManagerToolDefinitions() {
  return [...getReadOnlyToolDefinitions(), purchaseOrderProposalToolDefinition, purchaseOrderStatusProposalToolDefinition, menuRecipeProposalToolDefinition, inventoryProposalToolDefinition, supplierProposalToolDefinition, reservationProposalToolDefinition, orderProposalToolDefinition, restaurantSettingsProposalToolDefinition];
}

export async function askAIManager(input: { request: unknown; restaurant: AIRestaurantContext; clerkUserId: string }) {
  const validated = validateConversationInput(input.request);
  if (containsBrowserSuppliedTenantIdentity(validated.message)) return {
    answer: "I can’t use a restaurant, organization, tenant, or Clerk identifier supplied in chat. This workspace is resolved securely from your active Clerk organization. Please repeat the request using the ingredient or business record name only.",
    toolsUsed: [], activities: [], actionProposal: null,
  };
  checkInMemoryThrottle(input.restaurant.id);
  const result = await runAIToolLoop({
    provider: getAIProvider(), restaurant: input.restaurant, history: validated.history, message: validated.message,
    toolDefinitions: getAIManagerToolDefinitions(),
    executeTool: async ({ name, arguments: args, restaurant }) => {
      if (name === PURCHASE_ORDER_PROPOSAL_TOOL) {
        const candidate = validatePurchaseOrderProposalTool(args);
        await preparePurchaseOrderProposal({ restaurantId: restaurant.id, candidate });
        return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a purchase recommendation...", proposalCandidate: candidate };
      }
      if (name === MENU_RECIPE_PROPOSAL_TOOL) { const candidate = validateMenuRecipeProposalTool(args); await prepareMenuRecipeProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a menu change...", proposalCandidate: candidate }; }
      if (name === INVENTORY_PROPOSAL_TOOL) { const candidate = validateInventoryProposalIntent(validateInventoryProposalTool(args), validated.message); await prepareInventoryProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing an inventory change...", proposalCandidate: candidate }; }
      if (name === SUPPLIER_PROPOSAL_TOOL) { const candidate = validateSupplierProposalTool(args); await prepareSupplierProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a supplier change...", proposalCandidate: candidate }; }
      if (name === RESERVATION_PROPOSAL_TOOL) { const candidate = validateReservationProposalTool(args); await prepareReservationProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a reservation change...", proposalCandidate: candidate }; }
      if (name === ORDER_PROPOSAL_TOOL) { const candidate = validateOrderProposalTool(args); await prepareOrderProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing an order change...", proposalCandidate: candidate }; }
      if (name === RESTAURANT_SETTINGS_PROPOSAL_TOOL) { const candidate = validateRestaurantSettingsProposalTool(args); await prepareRestaurantSettingsProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a settings change...", proposalCandidate: candidate }; }
      if (name === PURCHASE_ORDER_STATUS_PROPOSAL_TOOL) { const candidate = validatePurchaseOrderStatusProposalTool(args); await preparePurchaseOrderStatusProposal({ restaurantId: restaurant.id, candidate }); return { content: JSON.stringify({ accepted: true, humanApprovalRequired: true }), activity: "Preparing a purchase-order status change...", proposalCandidate: candidate }; }
      return { content: await executeReadOnlyTool({ name, arguments: args, context: { restaurant } }), activity: getToolActivity(name) };
    },
  });
  const candidate = result.proposalCandidate;
  const actionProposal = !candidate ? null
    : isSupplierCandidate(candidate) ? await persistSupplierProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await prepareSupplierProposal({ restaurantId: input.restaurant.id, candidate }) })
    : isReservationCandidate(candidate) ? await persistReservationProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await prepareReservationProposal({ restaurantId: input.restaurant.id, candidate }) })
    : isOrderCandidate(candidate) ? await persistOrderProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await prepareOrderProposal({ restaurantId: input.restaurant.id, candidate }) })
    : isRestaurantSettingsCandidate(candidate) ? await persistRestaurantSettingsProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await prepareRestaurantSettingsProposal({ restaurantId: input.restaurant.id, candidate }) })
    : isPurchaseOrderStatusCandidate(candidate) ? await persistPurchaseOrderStatusProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await preparePurchaseOrderStatusProposal({ restaurantId: input.restaurant.id, candidate }) })
    : isPurchaseOrderCandidate(candidate) ? await persistPurchaseOrderProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await preparePurchaseOrderProposal({ restaurantId: input.restaurant.id, candidate }) })
    : "menuItemName" in candidate ? await persistMenuRecipeProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await prepareMenuRecipeProposal({ restaurantId: input.restaurant.id, candidate }) })
    : await persistInventoryProposal({ restaurantId: input.restaurant.id, clerkUserId: input.clerkUserId, prepared: await prepareInventoryProposal({ restaurantId: input.restaurant.id, candidate }) });
  return { answer: result.answer, toolsUsed: result.toolsUsed.filter((name) => ![PURCHASE_ORDER_PROPOSAL_TOOL, PURCHASE_ORDER_STATUS_PROPOSAL_TOOL, MENU_RECIPE_PROPOSAL_TOOL, INVENTORY_PROPOSAL_TOOL, SUPPLIER_PROPOSAL_TOOL, RESERVATION_PROPOSAL_TOOL, ORDER_PROPOSAL_TOOL, RESTAURANT_SETTINGS_PROPOSAL_TOOL].includes(name)), activities: result.activities, actionProposal };
}
