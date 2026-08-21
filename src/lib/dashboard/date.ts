type DateParts = {
  year: number;
  month: number;
  day: number;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = dateFormatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateFormatterCache.set(timeZone, value);
  }
  return value;
}

export function getZonedDateParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function zonedDateTimeToUtc(
  parts: DateParts & { hour?: number; minute?: number; second?: number },
  timeZone: string,
) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  let result = target;

  // A second pass handles timezones whose offset changes around this instant.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const observed = getZonedDateParts(new Date(result), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    result -= observedAsUtc - target;
  }

  return new Date(result);
}

export function dateKey(parts: DateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function partsFromKey(key: string): DateParts {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function addDays(key: string, amount: number) {
  const parts = partsFromKey(key);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12));
  return date.toISOString().slice(0, 10);
}

export function dayRange(key: string, timeZone: string) {
  return {
    start: zonedDateTimeToUtc(partsFromKey(key), timeZone),
    end: zonedDateTimeToUtc(partsFromKey(addDays(key, 1)), timeZone),
  };
}

export function weekday(key: string) {
  const parts = partsFromKey(key);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

export function nextFriday(todayKey: string) {
  const daysUntilFriday = (5 - weekday(todayKey) + 7) % 7 || 7;
  return addDays(todayKey, daysUntilFriday);
}
