import type { OrderStatusValue, OrderTypeValue } from "@/lib/orders/policy";

export function normalizeDecimal(value: string, options: { required?: boolean; allowNegative?: boolean; decimalPlaces?: number } = {}) {
  const cleaned = value.trim().replace(/[₹$€£\s]/g, "").replace(/,/g, "");
  if (!cleaned) return options.required ? { value: null, error: "A value is required." } : { value: "0", error: null };
  const places = options.decimalPlaces ?? 2;
  const sign = options.allowNegative ? "-?" : "";
  if (!new RegExp("^" + sign + "\\d+(?:\\.\\d{1," + places + "})?$").test(cleaned)) return { value: null, error: "Enter a valid number with up to " + places + " decimal places." };
  return { value: cleaned, error: null };
}

export function normalizePositiveInteger(value: string) {
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned) || Number(cleaned) < 1 || !Number.isSafeInteger(Number(cleaned))) return { value: null, error: "Enter a positive whole number." };
  return { value: Number(cleaned), error: null };
}

function dateFromParts(year: number, month: number, day: number, time = "00:00:00") {
  const timestamp = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0") + "T" + time.padEnd(8, ":00") + "Z";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day ? null : date;
}

export function normalizeDate(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return { value: null, error: "A date is required." };
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso) {
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(cleaned);
    if (hasZone) { const parsed = new Date(cleaned); return Number.isNaN(parsed.getTime()) ? { value: null, error: "Invalid date or timestamp." } : { value: parsed, error: null }; }
    const parsed = dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[4] ?? "00:00:00");
    return parsed ? { value: parsed, error: null } : { value: null, error: "Invalid date or timestamp." };
  }
  const regional = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?))?$/);
  if (regional) {
    const first = Number(regional[1]); const second = Number(regional[2]);
    if (first <= 12 && second <= 12) return { value: null, error: "Ambiguous date. Use YYYY-MM-DD or an unambiguous day/month value." };
    const day = first > 12 ? first : second; const month = first > 12 ? second : first;
    const parsed = dateFromParts(Number(regional[3]), month, day, regional[4] ?? "00:00:00");
    return parsed ? { value: parsed, error: null } : { value: null, error: "Invalid date or timestamp." };
  }
  return { value: null, error: "Unsupported date format. Use ISO or an unambiguous DD/MM/YYYY timestamp." };
}

const orderStatusAliases: Record<string, OrderStatusValue> = { pending: "PENDING", confirmed: "CONFIRMED", preparing: "PREPARING", ready: "READY", completed: "COMPLETED", complete: "COMPLETED", paid: "COMPLETED", cancelled: "CANCELLED", canceled: "CANCELLED", void: "CANCELLED" };
const orderTypeAliases: Record<string, OrderTypeValue> = { dinein: "DINE_IN", dine: "DINE_IN", takeaway: "TAKEAWAY", takeout: "TAKEAWAY", pickup: "TAKEAWAY", delivery: "DELIVERY" };
export function normalizeHistoricalOrderStatus(value: string): OrderStatusValue | null {
  if (!value.trim()) return "COMPLETED";
  const mapped = orderStatusAliases[value.toLocaleLowerCase().replace(/[^a-z]/g, "")];
  return mapped === "CANCELLED" ? "CANCELLED" : mapped ? "COMPLETED" : null;
}
export function normalizeOrderType(value: string): OrderTypeValue | null {
  if (!value.trim()) return "DINE_IN";
  return orderTypeAliases[value.toLocaleLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

export type ReservationStatusValue = "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
const reservationAliases: Record<string, ReservationStatusValue> = { pending: "PENDING", confirmed: "CONFIRMED", booked: "CONFIRMED", seated: "SEATED", completed: "COMPLETED", complete: "COMPLETED", cancelled: "CANCELLED", canceled: "CANCELLED", noshow: "NO_SHOW" };
export function normalizeReservationStatus(value: string): ReservationStatusValue | null {
  if (!value.trim()) return "CONFIRMED";
  return reservationAliases[value.toLocaleLowerCase().replace(/[^a-z]/g, "")] ?? null;
}
