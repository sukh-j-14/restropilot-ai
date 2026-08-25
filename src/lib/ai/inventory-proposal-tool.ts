import { AIManagerError } from "@/lib/ai/errors";
import type { InventoryActionType, InventoryAdjustmentKind, InventoryProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIToolDefinition } from "@/lib/ai/types";

export const INVENTORY_PROPOSAL_TOOL = "propose_inventory_action";
const actionTypes: InventoryActionType[] = ["CREATE_INGREDIENT", "UPDATE_INGREDIENT", "ADJUST_INVENTORY_STOCK"];
const adjustmentKinds: InventoryAdjustmentKind[] = ["RECEIPT", "USAGE", "WASTE", "COUNT"];

export const inventoryProposalToolDefinition: AIToolDefinition = {
  name: INVENTORY_PROPOSAL_TOOL,
  description: "Propose, but never execute, one inventory change after resolving the ingredient with read tools. Human approval is required.",
  parameters: { type: "object", properties: {
    action_type: { type: "string", enum: actionTypes }, ingredient_name: { type: "string", minLength: 1, maxLength: 120 }, name: { type: "string", minLength: 2, maxLength: 120 }, unit: { type: "string", enum: ["kg", "litre", "piece"] }, initial_stock: { type: "number", minimum: 0, maximum: 999999999.999 }, reorder_level: { type: "number", minimum: 0, maximum: 999999999.999 }, cost_per_unit: { type: "number", minimum: 0, maximum: 99999999.9999 }, adjustment_kind: { type: "string", enum: adjustmentKinds }, quantity: { type: "number", minimum: 0, maximum: 999999999.999 }, quantity_unit: { type: "string", enum: ["kg", "g", "litre", "ml", "piece"] }, counted_stock: { type: "number", minimum: 0, maximum: 999999999.999 }, reason: { type: "string", maxLength: 300 }, explanation: { type: "string", minLength: 1, maxLength: 1000 },
  }, required: ["action_type", "ingredient_name", "explanation"], additionalProperties: false },
};

function plain(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Inventory proposal must be a plain object."); return value as Record<string, unknown>; }
function optionalNumber(record: Record<string, unknown>, key: string, max: number) { const value = record[key]; if (value === undefined) return undefined; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`); return value; }
function optionalString(record: Record<string, unknown>, key: string, max: number) { const value = record[key]; if (value === undefined) return undefined; if (typeof value !== "string" || !value.trim() || value.length > max) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`); return value.trim(); }

export function validateInventoryProposalTool(value: unknown): InventoryProposalCandidate {
  const record = plain(value); const allowed = ["action_type", "ingredient_name", "name", "unit", "initial_stock", "reorder_level", "cost_per_unit", "adjustment_kind", "quantity", "quantity_unit", "counted_stock", "reason", "explanation"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new AIManagerError("INVALID_TOOL", "Inventory proposal contains unsupported fields.");
  if (!actionTypes.includes(record.action_type as InventoryActionType)) throw new AIManagerError("INVALID_TOOL", "Inventory action type is unsupported.");
  const ingredientName = optionalString(record, "ingredient_name", 120); const explanation = optionalString(record, "explanation", 1000);
  if (!ingredientName || !explanation) throw new AIManagerError("INVALID_TOOL", "Ingredient name and explanation are required.");
  const adjustmentKind = record.adjustment_kind as InventoryAdjustmentKind | undefined;
  if (adjustmentKind && !adjustmentKinds.includes(adjustmentKind)) throw new AIManagerError("INVALID_TOOL", "Adjustment kind is invalid.");
  return { actionType: record.action_type as InventoryActionType, ingredientName, name: optionalString(record, "name", 120), unit: optionalString(record, "unit", 20), initialStock: optionalNumber(record, "initial_stock", 999999999.999), reorderLevel: optionalNumber(record, "reorder_level", 999999999.999), costPerUnit: optionalNumber(record, "cost_per_unit", 99999999.9999), adjustmentKind, quantity: optionalNumber(record, "quantity", 999999999.999), quantityUnit: optionalString(record, "quantity_unit", 20), countedStock: optionalNumber(record, "counted_stock", 999999999.999), reason: optionalString(record, "reason", 300), explanation };
}
