import { AIManagerError } from "@/lib/ai/errors";
import type { RestaurantSettingsProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIToolDefinition } from "@/lib/ai/types";

export const RESTAURANT_SETTINGS_PROPOSAL_TOOL = "propose_restaurant_settings_action";

export const restaurantSettingsProposalToolDefinition: AIToolDefinition = {
  name: RESTAURANT_SETTINGS_PROPOSAL_TOOL,
  description: "Propose, but never execute, changes to the active restaurant's editable settings. Read current settings first. Organization-admin approval is required.",
  parameters: {
    type: "object",
    properties: {
      action_type: { type: "string", enum: ["UPDATE_RESTAURANT_SETTINGS"] },
      name: { type: "string", minLength: 2, maxLength: 120 },
      phone: { type: "string", maxLength: 24 },
      address: { type: "string", maxLength: 300 },
      timezone: { type: "string", maxLength: 64 },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      guest_capacity: { type: "integer", minimum: 1, maximum: 2000 },
      explanation: { type: "string", minLength: 1, maxLength: 1000 },
    },
    required: ["action_type", "explanation"],
    additionalProperties: false,
  },
};

function plain(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Settings proposal must be a plain object.");
  return value as Record<string, unknown>;
}

function optionalString(record: Record<string, unknown>, key: string, max: number, allowEmpty = false) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`);
  return value.trim();
}

export function validateRestaurantSettingsProposalTool(value: unknown): RestaurantSettingsProposalCandidate {
  const record = plain(value);
  const allowed = ["action_type", "name", "phone", "address", "timezone", "currency", "guest_capacity", "explanation"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new AIManagerError("INVALID_TOOL", "Settings proposal contains unsupported fields.");
  if (record.action_type !== "UPDATE_RESTAURANT_SETTINGS") throw new AIManagerError("INVALID_TOOL", "Settings action type is unsupported.");
  const explanation = optionalString(record, "explanation", 1000);
  if (!explanation) throw new AIManagerError("INVALID_TOOL", "A concise explanation is required.");
  const guestCapacity = record.guest_capacity;
  if (guestCapacity !== undefined && (!Number.isInteger(guestCapacity) || (guestCapacity as number) < 1 || (guestCapacity as number) > 2000)) throw new AIManagerError("INVALID_TOOL", "guest_capacity is invalid.");
  const candidate: RestaurantSettingsProposalCandidate = {
    actionType: "UPDATE_RESTAURANT_SETTINGS",
    name: optionalString(record, "name", 120),
    phone: optionalString(record, "phone", 24, true),
    address: optionalString(record, "address", 300, true),
    timezone: optionalString(record, "timezone", 64),
    currency: optionalString(record, "currency", 3),
    guestCapacity: guestCapacity as number | undefined,
    explanation,
  };
  if ([candidate.name, candidate.phone, candidate.address, candidate.timezone, candidate.currency, candidate.guestCapacity].every((field) => field === undefined)) throw new AIManagerError("INVALID_TOOL", "At least one editable setting must change.");
  return candidate;
}
