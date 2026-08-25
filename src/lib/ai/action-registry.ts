import { AI_ACTION_POLICIES, type AIActionPolicy, type AIActionType } from "@/lib/ai/action-policy";

export type AIActionRegistration = {
  type: AIActionType;
  title: string;
  proposalToolName: string;
  handlerKey: "purchase-order-draft" | "purchase-order-lifecycle" | "menu-recipe" | "inventory" | "supplier" | "reservation" | "order" | "restaurant-settings";
  proposalValidatorKey: "purchase-order-draft" | "purchase-order-lifecycle" | "menu-recipe" | "inventory" | "supplier" | "reservation" | "order" | "restaurant-settings";
  staleCheckKey: "inventory-and-open-purchase-orders" | "purchase-order-snapshot" | "menu-recipe-snapshot" | "ingredient-snapshot" | "supplier-snapshot" | "reservation-snapshot" | "order-snapshot" | "restaurant-settings-snapshot";
  displayRendererKey: "purchase-order-draft-card" | "purchase-order-lifecycle-card" | "menu-recipe-card" | "inventory-card" | "supplier-card" | "reservation-card" | "order-card" | "restaurant-settings-card";
  policy: AIActionPolicy;
};

type MenuActionType = "CREATE_MENU_ITEM" | "UPDATE_MENU_ITEM" | "SET_MENU_ITEM_AVAILABILITY" | "ADD_RECIPE_INGREDIENT" | "UPDATE_RECIPE_INGREDIENT" | "REMOVE_RECIPE_INGREDIENT";
function menuAction(type: MenuActionType, title: string): AIActionRegistration { return Object.freeze({ type, title, proposalToolName: "propose_menu_recipe_action", handlerKey: "menu-recipe", proposalValidatorKey: "menu-recipe", staleCheckKey: "menu-recipe-snapshot", displayRendererKey: "menu-recipe-card", policy: AI_ACTION_POLICIES[type] }); }
function inventoryAction(type: "CREATE_INGREDIENT" | "UPDATE_INGREDIENT" | "ADJUST_INVENTORY_STOCK", title: string): AIActionRegistration { return Object.freeze({ type, title, proposalToolName: "propose_inventory_action", handlerKey: "inventory", proposalValidatorKey: "inventory", staleCheckKey: "ingredient-snapshot", displayRendererKey: "inventory-card", policy: AI_ACTION_POLICIES[type] }); }
function supplierAction(type: "CREATE_SUPPLIER" | "UPDATE_SUPPLIER", title: string): AIActionRegistration { return Object.freeze({ type, title, proposalToolName: "propose_supplier_action", handlerKey: "supplier", proposalValidatorKey: "supplier", staleCheckKey: "supplier-snapshot", displayRendererKey: "supplier-card", policy: AI_ACTION_POLICIES[type] }); }
function reservationAction(type: "CREATE_RESERVATION" | "UPDATE_RESERVATION" | "TRANSITION_RESERVATION_STATUS", title: string): AIActionRegistration { return Object.freeze({ type, title, proposalToolName: "propose_reservation_action", handlerKey: "reservation", proposalValidatorKey: "reservation", staleCheckKey: "reservation-snapshot", displayRendererKey: "reservation-card", policy: AI_ACTION_POLICIES[type] }); }
function orderAction(type: "CREATE_ORDER" | "UPDATE_ORDER_ITEMS" | "TRANSITION_ORDER_STATUS", title: string): AIActionRegistration { return Object.freeze({ type, title, proposalToolName: "propose_order_action", handlerKey: "order", proposalValidatorKey: "order", staleCheckKey: "order-snapshot", displayRendererKey: "order-card", policy: AI_ACTION_POLICIES[type] }); }

export const AI_ACTION_REGISTRY: Readonly<Record<AIActionType, AIActionRegistration>> = Object.freeze({
  CREATE_PURCHASE_ORDER_DRAFT: Object.freeze({
    type: "CREATE_PURCHASE_ORDER_DRAFT",
    title: "Recommended Purchase Order",
    proposalToolName: "propose_purchase_order_draft",
    handlerKey: "purchase-order-draft",
    proposalValidatorKey: "purchase-order-draft",
    staleCheckKey: "inventory-and-open-purchase-orders",
    displayRendererKey: "purchase-order-draft-card",
    policy: AI_ACTION_POLICIES.CREATE_PURCHASE_ORDER_DRAFT,
  }),
  CREATE_MENU_ITEM: menuAction("CREATE_MENU_ITEM", "Create Menu Item"),
  UPDATE_MENU_ITEM: menuAction("UPDATE_MENU_ITEM", "Update Menu Item"),
  SET_MENU_ITEM_AVAILABILITY: menuAction("SET_MENU_ITEM_AVAILABILITY", "Change Menu Availability"),
  ADD_RECIPE_INGREDIENT: menuAction("ADD_RECIPE_INGREDIENT", "Add Recipe Ingredient"),
  UPDATE_RECIPE_INGREDIENT: menuAction("UPDATE_RECIPE_INGREDIENT", "Update Recipe Ingredient"),
  REMOVE_RECIPE_INGREDIENT: menuAction("REMOVE_RECIPE_INGREDIENT", "Remove Recipe Ingredient"),
  CREATE_INGREDIENT: inventoryAction("CREATE_INGREDIENT", "Create Ingredient"),
  UPDATE_INGREDIENT: inventoryAction("UPDATE_INGREDIENT", "Update Ingredient"),
  ADJUST_INVENTORY_STOCK: inventoryAction("ADJUST_INVENTORY_STOCK", "Adjust Inventory Stock"),
  CREATE_SUPPLIER: supplierAction("CREATE_SUPPLIER", "Create Supplier"),
  UPDATE_SUPPLIER: supplierAction("UPDATE_SUPPLIER", "Update Supplier"),
  CREATE_RESERVATION: reservationAction("CREATE_RESERVATION", "Create Reservation"),
  UPDATE_RESERVATION: reservationAction("UPDATE_RESERVATION", "Update Reservation"),
  TRANSITION_RESERVATION_STATUS: reservationAction("TRANSITION_RESERVATION_STATUS", "Change Reservation Status"),
  CREATE_ORDER: orderAction("CREATE_ORDER", "Create Order"),
  UPDATE_ORDER_ITEMS: orderAction("UPDATE_ORDER_ITEMS", "Update Order Items"),
  TRANSITION_ORDER_STATUS: orderAction("TRANSITION_ORDER_STATUS", "Change Order Status"),
  UPDATE_RESTAURANT_SETTINGS: Object.freeze({
    type: "UPDATE_RESTAURANT_SETTINGS",
    title: "Update Restaurant Settings",
    proposalToolName: "propose_restaurant_settings_action",
    handlerKey: "restaurant-settings",
    proposalValidatorKey: "restaurant-settings",
    staleCheckKey: "restaurant-settings-snapshot",
    displayRendererKey: "restaurant-settings-card",
    policy: AI_ACTION_POLICIES.UPDATE_RESTAURANT_SETTINGS,
  }),
  TRANSITION_PURCHASE_ORDER_STATUS: Object.freeze({
    type: "TRANSITION_PURCHASE_ORDER_STATUS",
    title: "Update Purchase Order",
    proposalToolName: "propose_purchase_order_status_action",
    handlerKey: "purchase-order-lifecycle",
    proposalValidatorKey: "purchase-order-lifecycle",
    staleCheckKey: "purchase-order-snapshot",
    displayRendererKey: "purchase-order-lifecycle-card",
    policy: AI_ACTION_POLICIES.TRANSITION_PURCHASE_ORDER_STATUS,
  }),
});

export function getAIActionRegistration(type: unknown): AIActionRegistration | null {
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(AI_ACTION_REGISTRY, type)) return null;
  return AI_ACTION_REGISTRY[type as AIActionType];
}

export function getRegisteredAIActionTypes() {
  return Object.keys(AI_ACTION_REGISTRY) as AIActionType[];
}

export function describeProposableAIActions() {
  return getRegisteredAIActionTypes().map((type) => {
    const action = AI_ACTION_REGISTRY[type];
    return `- ${type}: proposal only; ${action.policy.riskLevel.toLowerCase()} risk; human approval ${action.policy.humanApprovalRequired ? "required" : "not required"}`;
  }).join("\n");
}
