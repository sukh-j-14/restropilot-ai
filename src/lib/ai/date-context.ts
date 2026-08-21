import { addDays, dateKey, dayRange, getZonedDateParts, nextFriday, partsFromKey, weekday, zonedDateTimeToUtc } from "@/lib/dashboard/date";

export function getRestaurantDateContext(timezone: string, now = new Date()) {
  const today = dateKey(getZonedDateParts(now, timezone));
  const yesterday = addDays(today, -1);
  const mondayOffset = (weekday(today) + 6) % 7;
  const thisWeekStart = addDays(today, -mondayOffset);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const lastWeekEnd = addDays(thisWeekStart, -1);
  const parts = partsFromKey(today);
  const thisMonthStart = `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
  return { today, yesterday, thisWeekStart, lastWeekStart, lastWeekEnd, thisMonthStart, nextFriday: nextFriday(today) };
}

export function inclusiveDateRange(startDate: string, endDate: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
  const startParts = partsFromKey(startDate); const endParts = partsFromKey(endDate);
  if (![startParts.year, startParts.month, startParts.day, endParts.year, endParts.month, endParts.day].every(Number.isInteger)) return null;
  const canonical = (parts: typeof startParts) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toISOString().slice(0, 10);
  if (canonical(startParts) !== startDate || canonical(endParts) !== endDate) return null;
  const start = zonedDateTimeToUtc(startParts, timezone);
  const end = dayRange(endDate, timezone).end;
  const days = (Date.UTC(endParts.year, endParts.month - 1, endParts.day) - Date.UTC(startParts.year, startParts.month - 1, startParts.day)) / 86_400_000;
  if (days < 0 || days > 366 || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}
