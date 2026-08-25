import { AIManagerError } from "@/lib/ai/errors";
import type { ReservationActionType, ReservationProposalCandidate } from "@/lib/ai/action-proposal-types";
import type { AIToolDefinition } from "@/lib/ai/types";
import { RESERVATION_STATUSES } from "@/lib/reservations/policy";

export const RESERVATION_PROPOSAL_TOOL = "propose_reservation_action";
const actionTypes: ReservationActionType[] = ["CREATE_RESERVATION", "UPDATE_RESERVATION", "TRANSITION_RESERVATION_STATUS"];
const localDateTime = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$";

export const reservationProposalToolDefinition: AIToolDefinition = {
  name: RESERVATION_PROPOSAL_TOOL,
  description: "Propose, but never execute, creating, updating, or transitioning one reservation. Times must be normalized as restaurant-local YYYY-MM-DDTHH:mm. Resolve existing reservations with read tools first. Human approval is required.",
  parameters: { type: "object", properties: {
    action_type: { type: "string", enum: actionTypes }, customer_name: { type: "string", minLength: 2, maxLength: 120 },
    current_reservation_time: { type: "string", pattern: localDateTime }, reservation_time: { type: "string", pattern: localDateTime },
    guest_count: { type: "integer", minimum: 1, maximum: 500 }, table_number: { type: ["string", "null"], maxLength: 40 },
    status: { type: "string", enum: RESERVATION_STATUSES }, explanation: { type: "string", minLength: 1, maxLength: 1000 },
  }, required: ["action_type", "customer_name", "explanation"], additionalProperties: false },
};

function plain(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Reservation proposal must be a plain object."); return value as Record<string, unknown>; }
function text(record: Record<string, unknown>, key: string, max: number) { const value = record[key]; if (value === undefined) return undefined; if (typeof value !== "string" || !value.trim() || value.length > max) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`); return value.trim(); }
function dateTime(record: Record<string, unknown>, key: string) { const value = text(record, key, 16); if (value !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new AIManagerError("INVALID_TOOL", `${key} must be a restaurant-local date and time.`); return value; }

export function validateReservationProposalTool(value: unknown): ReservationProposalCandidate {
  const record = plain(value);
  const allowed = ["action_type", "customer_name", "current_reservation_time", "reservation_time", "guest_count", "table_number", "status", "explanation"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new AIManagerError("INVALID_TOOL", "Reservation proposal contains unsupported fields.");
  if (!actionTypes.includes(record.action_type as ReservationActionType)) throw new AIManagerError("INVALID_TOOL", "Reservation action type is unsupported.");
  const actionType = record.action_type as ReservationActionType;
  const customerName = text(record, "customer_name", 120); const explanation = text(record, "explanation", 1000);
  if (!customerName || !explanation) throw new AIManagerError("INVALID_TOOL", "Customer name and explanation are required.");
  const guestCount = record.guest_count === undefined ? undefined : record.guest_count;
  if (guestCount !== undefined && (!Number.isInteger(guestCount) || Number(guestCount) < 1 || Number(guestCount) > 500)) throw new AIManagerError("INVALID_TOOL", "guest_count is invalid.");
  if (record.table_number !== undefined && record.table_number !== null && (typeof record.table_number !== "string" || record.table_number.length > 40)) throw new AIManagerError("INVALID_TOOL", "table_number is invalid.");
  if (record.status !== undefined && !RESERVATION_STATUSES.includes(record.status as never)) throw new AIManagerError("INVALID_TOOL", "Reservation status is invalid.");
  const candidate: ReservationProposalCandidate = { actionType, customerName, currentReservationTime: dateTime(record, "current_reservation_time"), reservationTime: dateTime(record, "reservation_time"), guestCount: guestCount as number | undefined, tableNumber: record.table_number as string | null | undefined, status: record.status as string | undefined, explanation };
  if (actionType === "CREATE_RESERVATION" && (!candidate.reservationTime || candidate.guestCount === undefined)) throw new AIManagerError("INVALID_TOOL", "Creation requires reservation_time and guest_count.");
  if (actionType !== "CREATE_RESERVATION" && !candidate.currentReservationTime) throw new AIManagerError("INVALID_TOOL", "Existing reservation actions require current_reservation_time from a read tool.");
  if (actionType === "UPDATE_RESERVATION" && candidate.reservationTime === undefined && candidate.guestCount === undefined && candidate.tableNumber === undefined) throw new AIManagerError("INVALID_TOOL", "At least one editable reservation field must change.");
  if (actionType === "TRANSITION_RESERVATION_STATUS" && !candidate.status) throw new AIManagerError("INVALID_TOOL", "A target status is required.");
  return candidate;
}
