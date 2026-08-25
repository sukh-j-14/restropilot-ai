export type AIActionType = "CREATE_PURCHASE_ORDER_DRAFT" | "CREATE_MENU_ITEM" | "UPDATE_MENU_ITEM" | "SET_MENU_ITEM_AVAILABILITY" | "ADD_RECIPE_INGREDIENT" | "UPDATE_RECIPE_INGREDIENT" | "REMOVE_RECIPE_INGREDIENT" | "CREATE_INGREDIENT" | "UPDATE_INGREDIENT" | "ADJUST_INVENTORY_STOCK" | "CREATE_SUPPLIER" | "UPDATE_SUPPLIER" | "CREATE_RESERVATION" | "UPDATE_RESERVATION" | "TRANSITION_RESERVATION_STATUS" | "CREATE_ORDER" | "UPDATE_ORDER_ITEMS" | "TRANSITION_ORDER_STATUS" | "UPDATE_RESTAURANT_SETTINGS" | "TRANSITION_PURCHASE_ORDER_STATUS";
export type AIActionRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AIActionAuthorization = "AUTHENTICATED_MEMBER" | "ORGANIZATION_ADMIN";

export type AIActionPolicy = {
  riskLevel: AIActionRiskLevel;
  humanApprovalRequired: boolean;
  confirmationRequired: boolean;
  authorization: AIActionAuthorization;
  expiresAfterMs: number;
};

export const DEFAULT_ACTION_EXPIRY_MS = 30 * 60 * 1_000;

function mediumAdmin(): AIActionPolicy {
  return { riskLevel: "MEDIUM", humanApprovalRequired: true, confirmationRequired: true, authorization: "ORGANIZATION_ADMIN", expiresAfterMs: DEFAULT_ACTION_EXPIRY_MS };
}
function highAdmin(): AIActionPolicy {
  return { riskLevel: "HIGH", humanApprovalRequired: true, confirmationRequired: true, authorization: "ORGANIZATION_ADMIN", expiresAfterMs: DEFAULT_ACTION_EXPIRY_MS };
}

export const AI_ACTION_POLICIES: Record<AIActionType, AIActionPolicy> = {
  CREATE_PURCHASE_ORDER_DRAFT: {
    riskLevel: "MEDIUM",
    humanApprovalRequired: true,
    confirmationRequired: true,
    authorization: "ORGANIZATION_ADMIN",
    expiresAfterMs: DEFAULT_ACTION_EXPIRY_MS,
  },
  CREATE_MENU_ITEM: mediumAdmin(),
  UPDATE_MENU_ITEM: mediumAdmin(),
  SET_MENU_ITEM_AVAILABILITY: mediumAdmin(),
  ADD_RECIPE_INGREDIENT: mediumAdmin(),
  UPDATE_RECIPE_INGREDIENT: mediumAdmin(),
  REMOVE_RECIPE_INGREDIENT: mediumAdmin(),
  CREATE_INGREDIENT: mediumAdmin(),
  UPDATE_INGREDIENT: mediumAdmin(),
  ADJUST_INVENTORY_STOCK: mediumAdmin(),
  CREATE_SUPPLIER: mediumAdmin(),
  UPDATE_SUPPLIER: mediumAdmin(),
  CREATE_RESERVATION: mediumAdmin(),
  UPDATE_RESERVATION: mediumAdmin(),
  TRANSITION_RESERVATION_STATUS: mediumAdmin(),
  CREATE_ORDER: mediumAdmin(),
  UPDATE_ORDER_ITEMS: mediumAdmin(),
  TRANSITION_ORDER_STATUS: mediumAdmin(),
  UPDATE_RESTAURANT_SETTINGS: mediumAdmin(),
  TRANSITION_PURCHASE_ORDER_STATUS: highAdmin(),
};

export function isAuthorizedForAction(policy: AIActionPolicy, orgRole: string | null | undefined) {
  if (policy.authorization === "ORGANIZATION_ADMIN") return orgRole === "org:admin";
  return Boolean(orgRole);
}
