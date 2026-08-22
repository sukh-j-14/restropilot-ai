import { addDays, dateKey, dayRange, getZonedDateParts, partsFromKey, zonedDateTimeToUtc } from "@/lib/dashboard/date";

export const SALES_RANGE_PRESETS = ["today", "yesterday", "last7", "last30", "thisMonth", "custom"] as const;
export type SalesRangePreset = (typeof SALES_RANGE_PRESETS)[number];

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function validDateKey(value: string | undefined) {
  if (!value || !DATE_KEY.test(value)) return null;
  const parts = partsFromKey(value);
  const normalized = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toISOString().slice(0, 10);
  return normalized === value ? value : null;
}

function dayCount(startKey: string, endKey: string) {
  const start = partsFromKey(startKey);
  const end = partsFromKey(endKey);
  return Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000) + 1;
}

function displayDate(key: string) {
  const parts = partsFromKey(key);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function resolveSalesRange(input: {
  timeZone: string;
  preset?: string;
  start?: string;
  end?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const todayKey = dateKey(getZonedDateParts(now, input.timeZone));
  const preset = SALES_RANGE_PRESETS.includes(input.preset as SalesRangePreset)
    ? input.preset as SalesRangePreset
    : "last7";
  let startKey: string;
  let endKey: string;
  let label: string;
  let error: string | null = null;

  if (preset === "today") {
    startKey = endKey = todayKey;
    label = "Today";
  } else if (preset === "yesterday") {
    startKey = endKey = addDays(todayKey, -1);
    label = "Yesterday";
  } else if (preset === "last30") {
    startKey = addDays(todayKey, -29);
    endKey = todayKey;
    label = "Last 30 days";
  } else if (preset === "thisMonth") {
    const parts = partsFromKey(todayKey);
    startKey = dateKey({ year: parts.year, month: parts.month, day: 1 });
    endKey = todayKey;
    label = "This month to date";
  } else if (preset === "custom") {
    const customStart = validDateKey(input.start);
    const customEnd = validDateKey(input.end);
    if (!customStart || !customEnd || customStart > customEnd || dayCount(customStart, customEnd) > 366) {
      startKey = addDays(todayKey, -6);
      endKey = todayKey;
      label = "Last 7 days";
      error = "Choose a valid custom range of up to 366 days.";
    } else {
      startKey = customStart;
      endKey = customEnd;
      label = `${displayDate(startKey)} – ${displayDate(endKey)}`;
    }
  } else {
    startKey = addDays(todayKey, -6);
    endKey = todayKey;
    label = "Last 7 days";
  }

  const days = dayCount(startKey, endKey);
  const comparisonEndKey = addDays(startKey, -1);
  const comparisonStartKey = addDays(comparisonEndKey, -(days - 1));
  const start = dayRange(startKey, input.timeZone).start;
  const end = dayRange(endKey, input.timeZone).end;
  const comparisonStart = zonedDateTimeToUtc(partsFromKey(comparisonStartKey), input.timeZone);
  const comparisonEnd = dayRange(comparisonEndKey, input.timeZone).end;

  return {
    preset,
    startKey,
    endKey,
    start,
    end,
    comparisonStartKey,
    comparisonEndKey,
    comparisonStart,
    comparisonEnd,
    label,
    comparisonLabel: days === 1 ? displayDate(comparisonStartKey) : `${displayDate(comparisonStartKey)} – ${displayDate(comparisonEndKey)}`,
    dayCount: days,
    error,
  };
}
