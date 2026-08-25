import type { MenuRecipeProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIToolDefinition } from "@/lib/ai/types";

export const MENU_RECIPE_PROPOSAL_TOOL = "propose_menu_recipe_action";
const actionTypes = ["CREATE_MENU_ITEM", "UPDATE_MENU_ITEM", "SET_MENU_ITEM_AVAILABILITY", "ADD_RECIPE_INGREDIENT", "UPDATE_RECIPE_INGREDIENT", "REMOVE_RECIPE_INGREDIENT"] as const;
export const menuRecipeProposalToolDefinition: AIToolDefinition = { name: MENU_RECIPE_PROPOSAL_TOOL, description: "Propose, but never execute, one validated menu-item or recipe change. Resolve names with read tools first. Human approval is required.", parameters: { type: "object", properties: { action_type: { type: "string", enum: actionTypes }, menu_item_name: { type: "string", minLength: 1, maxLength: 120 }, name: { type: "string", minLength: 2, maxLength: 120 }, category: { type: "string", minLength: 2, maxLength: 80 }, price: { type: "number", minimum: 0, maximum: 9999999.99 }, is_active: { type: "boolean" }, ingredient_name: { type: "string", minLength: 1, maxLength: 120 }, quantity_required: { type: "number", minimum: 0, maximum: 999999999.999 }, explanation: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["action_type", "menu_item_name", "explanation"], additionalProperties: false } };

export function validateMenuRecipeProposalTool(value: unknown): MenuRecipeProposalCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Invalid proposal.");
  const r = value as Record<string, unknown>; const allowed = ["action_type", "menu_item_name", "name", "category", "price", "is_active", "ingredient_name", "quantity_required", "explanation"];
  if (Object.keys(r).some((key) => !allowed.includes(key)) || !actionTypes.includes(r.action_type as typeof actionTypes[number])) throw new Error("Unsupported action type.");
  const string = (key: string, max: number, required = false) => { const v = r[key]; if (v === undefined && !required) return undefined; if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error(`${key} is invalid.`); return v.trim(); };
  const number = (key: string, decimals: number) => { const v = r[key]; if (v === undefined) return undefined; if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || Math.round(v * 10 ** decimals) !== v * 10 ** decimals) throw new Error(`${key} is invalid.`); return v; };
  if (r.is_active !== undefined && typeof r.is_active !== "boolean") throw new Error("is_active is invalid.");
  return { actionType: r.action_type as MenuRecipeProposalCandidate["actionType"], menuItemName: string("menu_item_name", 120, true)!, name: string("name", 120), category: string("category", 80), price: number("price", 2), isActive: r.is_active as boolean | undefined, ingredientName: string("ingredient_name", 120), quantityRequired: number("quantity_required", 3), explanation: string("explanation", 1000, true)! };
}
