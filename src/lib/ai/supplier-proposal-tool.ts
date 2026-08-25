import { AIManagerError } from "@/lib/ai/errors";
import type { SupplierActionType, SupplierProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIToolDefinition } from "@/lib/ai/types";

export const SUPPLIER_PROPOSAL_TOOL = "propose_supplier_action";
const actionTypes: SupplierActionType[] = ["CREATE_SUPPLIER", "UPDATE_SUPPLIER"];

export const supplierProposalToolDefinition: AIToolDefinition = {
  name: SUPPLIER_PROPOSAL_TOOL,
  description: "Propose, but never execute, creating or updating one supplier. Resolve updates with supplier read tools first. Human approval is required.",
  parameters: {
    type: "object",
    properties: {
      action_type: { type: "string", enum: actionTypes },
      supplier_name: { type: "string", minLength: 2, maxLength: 120 },
      name: { type: "string", minLength: 2, maxLength: 120 },
      email: { type: "string", maxLength: 254 },
      phone: { type: "string", maxLength: 24 },
      explanation: { type: "string", minLength: 1, maxLength: 1000 },
    },
    required: ["action_type", "supplier_name", "explanation"],
    additionalProperties: false,
  },
};

function plain(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Supplier proposal must be a plain object.");
  return value as Record<string, unknown>;
}
function optionalString(record: Record<string, unknown>, key: string, max: number, allowEmpty = false) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`);
  return value.trim();
}

export function validateSupplierProposalTool(value: unknown): SupplierProposalCandidate {
  const record = plain(value);
  const allowed = ["action_type", "supplier_name", "name", "email", "phone", "explanation"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new AIManagerError("INVALID_TOOL", "Supplier proposal contains unsupported fields.");
  if (!actionTypes.includes(record.action_type as SupplierActionType)) throw new AIManagerError("INVALID_TOOL", "Supplier action type is unsupported.");
  const supplierName = optionalString(record, "supplier_name", 120);
  const explanation = optionalString(record, "explanation", 1000);
  if (!supplierName || !explanation) throw new AIManagerError("INVALID_TOOL", "Supplier name and explanation are required.");
  const candidate = { actionType: record.action_type as SupplierActionType, supplierName, name: optionalString(record, "name", 120), email: optionalString(record, "email", 254, true), phone: optionalString(record, "phone", 24, true), explanation };
  if (candidate.actionType === "UPDATE_SUPPLIER" && candidate.name === undefined && candidate.email === undefined && candidate.phone === undefined) throw new AIManagerError("INVALID_TOOL", "At least one supplier field must change.");
  return candidate;
}
