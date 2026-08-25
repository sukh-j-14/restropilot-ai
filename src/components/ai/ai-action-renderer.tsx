"use client";
import { PurchaseOrderProposalCard } from "@/components/ai/purchase-order-proposal-card";
import { MenuRecipeProposalCard } from "@/components/ai/menu-recipe-proposal-card";
import { InventoryProposalCard } from "@/components/ai/inventory-proposal-card";
import { SupplierProposalCard } from "@/components/ai/supplier-proposal-card";
import { ReservationProposalCard } from "@/components/ai/reservation-proposal-card";
import { OrderProposalCard } from "@/components/ai/order-proposal-card";
import { RestaurantSettingsProposalCard } from "@/components/ai/restaurant-settings-proposal-card";
import { PurchaseOrderStatusProposalCard } from "@/components/ai/purchase-order-status-proposal-card";
import type { AIActionProposal } from "@/lib/ai/action-proposal-types";

export function AIActionRenderer({ proposal, currency }: { proposal: AIActionProposal; currency: string }) {
  switch (proposal.type) {
    case "CREATE_PURCHASE_ORDER_DRAFT": return <PurchaseOrderProposalCard proposal={proposal} currency={currency} />;
    case "TRANSITION_PURCHASE_ORDER_STATUS": return <PurchaseOrderStatusProposalCard proposal={proposal} currency={currency} />;
    case "CREATE_MENU_ITEM": case "UPDATE_MENU_ITEM": case "SET_MENU_ITEM_AVAILABILITY": case "ADD_RECIPE_INGREDIENT": case "UPDATE_RECIPE_INGREDIENT": case "REMOVE_RECIPE_INGREDIENT": return <MenuRecipeProposalCard proposal={proposal} currency={currency} />;
    case "CREATE_INGREDIENT": case "UPDATE_INGREDIENT": case "ADJUST_INVENTORY_STOCK": return <InventoryProposalCard proposal={proposal} currency={currency} />;
    case "CREATE_SUPPLIER": case "UPDATE_SUPPLIER": return <SupplierProposalCard proposal={proposal} />;
    case "CREATE_RESERVATION": case "UPDATE_RESERVATION": case "TRANSITION_RESERVATION_STATUS": return <ReservationProposalCard proposal={proposal} />;
    case "CREATE_ORDER": case "UPDATE_ORDER_ITEMS": case "TRANSITION_ORDER_STATUS": return <OrderProposalCard proposal={proposal} currency={currency} />;
    case "UPDATE_RESTAURANT_SETTINGS": return <RestaurantSettingsProposalCard proposal={proposal} />;
    default: return null;
  }
}
