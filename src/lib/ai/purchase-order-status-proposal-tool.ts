import { AIManagerError } from "@/lib/ai/errors";
import type { PurchaseOrderStatusProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIToolDefinition } from "@/lib/ai/types";
import { PURCHASE_ORDER_STATUSES } from "@/lib/purchase-orders/policy";

export const PURCHASE_ORDER_STATUS_PROPOSAL_TOOL = "propose_purchase_order_status_action";
export const purchaseOrderStatusProposalToolDefinition: AIToolDefinition = {
  name: PURCHASE_ORDER_STATUS_PROPOSAL_TOOL,
  description: "Propose, but never execute, one lifecycle transition for an existing purchase order. Resolve exactly one order with read tools first. Approval is always required.",
  parameters: { type: "object", properties: { action_type: { type: "string", enum: ["TRANSITION_PURCHASE_ORDER_STATUS"] }, reference: { type: "string", maxLength: 20 }, supplier_name: { type: "string", maxLength: 120 }, current_status: { type: "string", enum: PURCHASE_ORDER_STATUSES }, status: { type: "string", enum: PURCHASE_ORDER_STATUSES }, explanation: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["action_type", "status", "explanation"], additionalProperties: false },
};

export function validatePurchaseOrderStatusProposalTool(value: unknown): PurchaseOrderStatusProposalCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Purchase-order proposal must be a plain object.");
  const record = value as Record<string, unknown>;
  const allowed = ["action_type", "reference", "supplier_name", "current_status", "status", "explanation"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new AIManagerError("INVALID_TOOL", "Purchase-order proposal contains unsupported fields.");
  if (record.action_type !== "TRANSITION_PURCHASE_ORDER_STATUS") throw new AIManagerError("INVALID_TOOL", "Purchase-order action type is unsupported.");
  if (typeof record.status !== "string" || !PURCHASE_ORDER_STATUSES.includes(record.status as never)) throw new AIManagerError("INVALID_TOOL", "Target purchase-order status is invalid.");
  if (record.current_status !== undefined && (typeof record.current_status !== "string" || !PURCHASE_ORDER_STATUSES.includes(record.current_status as never))) throw new AIManagerError("INVALID_TOOL", "Current purchase-order status is invalid.");
  const text = (key: string, max: number) => record[key] === undefined ? undefined : typeof record[key] === "string" && record[key].trim() && record[key].length <= max ? record[key].trim() : null;
  const reference = text("reference", 20); const supplierName = text("supplier_name", 120); const explanation = text("explanation", 1000);
  if (reference === null || supplierName === null || !explanation) throw new AIManagerError("INVALID_TOOL", "Purchase-order proposal fields are invalid.");
  if (!reference && !supplierName) throw new AIManagerError("INVALID_TOOL", "A purchase-order reference or supplier name is required.");
  return { actionType: "TRANSITION_PURCHASE_ORDER_STATUS", reference, supplierName, currentStatus: record.current_status as string | undefined, status: record.status, explanation };
}
