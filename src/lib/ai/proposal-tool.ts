import { validateProposalCandidate } from "@/lib/ai/action-proposal-validation";
import type { AIToolDefinition } from "@/lib/ai/types";

export const PURCHASE_ORDER_PROPOSAL_TOOL = "propose_purchase_order_draft";
export const purchaseOrderProposalToolDefinition: AIToolDefinition = {
  name: PURCHASE_ORDER_PROPOSAL_TOOL,
  description: "Propose (but never create) one purchase-order draft after verifying inventory, suppliers, purchase history, and open purchase orders. Human approval is always required.",
  parameters: {
    type: "object",
    properties: {
      supplier_name: { type: "string", minLength: 1, maxLength: 120 },
      items: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", properties: { ingredient_name: { type: "string", minLength: 1, maxLength: 120 }, quantity: { type: "number", minimum: 0 } }, required: ["ingredient_name", "quantity"], additionalProperties: false } },
      expected_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      explanation: { type: "string", minLength: 1, maxLength: 1000 },
    },
    required: ["supplier_name", "items", "explanation"],
    additionalProperties: false,
  },
};

export function validatePurchaseOrderProposalTool(value: unknown) { return validateProposalCandidate(value); }
