import { getZonedDateParts, zonedDateTimeToUtc } from "@/lib/dashboard/date";
import type { ReservationStatusValue } from "@/lib/reservations/policy";
import { validateReservationStatus } from "@/lib/reservations/policy";

export type ReservationFields = {
  customerName: string;
  guestCount: string;
  reservationTime: string;
  tableNumber: string;
};

export type ReservationFieldErrors = Partial<Record<keyof ReservationFields, string>>;

function parseLocalDateTime(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: 0,
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.hour > 23 || parts.minute > 59) return null;
  const date = zonedDateTimeToUtc(parts, timezone);
  const observed = getZonedDateParts(date, timezone);
  return observed.year === parts.year && observed.month === parts.month && observed.day === parts.day && observed.hour === parts.hour && observed.minute === parts.minute ? date : null;
}

export function validateReservation(fields: ReservationFields, context: { timezone: string; guestCapacity: number | null }):
  | { success: true; data: { customerName: string; guestCount: number; reservationTime: Date; tableNumber: string | null } }
  | { success: false; fieldErrors: ReservationFieldErrors } {
  const customerName = fields.customerName.trim();
  const guestCount = /^\d+$/.test(fields.guestCount.trim()) ? Number(fields.guestCount) : null;
  const reservationTime = parseLocalDateTime(fields.reservationTime, context.timezone);
  const tableNumber = fields.tableNumber.trim();
  const fieldErrors: ReservationFieldErrors = {};
  if (customerName.length < 2 || customerName.length > 120) fieldErrors.customerName = "Guest name must be between 2 and 120 characters.";
  if (!guestCount || guestCount < 1 || guestCount > 500) fieldErrors.guestCount = "Guest count must be between 1 and 500.";
  else if (context.guestCapacity && guestCount > context.guestCapacity) fieldErrors.guestCount = `Guest count exceeds the restaurant capacity of ${context.guestCapacity}.`;
  if (!reservationTime) fieldErrors.reservationTime = "Enter a valid reservation date and time.";
  if (tableNumber.length > 40) fieldErrors.tableNumber = "Table number must be 40 characters or fewer.";
  return Object.keys(fieldErrors).length ? { success: false, fieldErrors } : { success: true, data: { customerName, guestCount: guestCount!, reservationTime: reservationTime!, tableNumber: tableNumber || null } };
}

export function validateReservationTransition(value: string): ReservationStatusValue | null {
  return validateReservationStatus(value);
}
