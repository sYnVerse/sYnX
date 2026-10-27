/**
 * IANA time zone helpers and wall-clock date math for recurring tasks.
 *
 * Recurring reminders must keep the same local clock time ("every Monday at
 * 9:00 AM") across daylight saving changes, so they are advanced on the
 * calendar in the user's time zone instead of by a fixed number of hours.
 * Uses only Intl (available in Cloudflare Workers, browsers, and Hermes).
 */

const TIME_ZONE_MAX_LENGTH = 64;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** True when the value is an IANA time zone name this runtime understands. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TIME_ZONE_MAX_LENGTH || trimmed !== value) return false;
  try {
    getFormatter(value);
    return true;
  } catch {
    return false;
  }
}

/** Device or browser IANA time zone (e.g. "America/Los_Angeles"), or undefined if unavailable. */
export function getLocalTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}

type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function toWallClock(epochMs: number, timeZone: string): WallClock {
  const parts = getFormatter(timeZone).formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24, // some engines print midnight as 24
    minute: get("minute"),
    second: get("second"),
    millisecond: ((epochMs % 1000) + 1000) % 1000,
  };
}

function wallClockAsUtc(w: WallClock): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.millisecond);
}

/** Offset of the zone from UTC (ms) at an instant. */
function zoneOffset(epochMs: number, timeZone: string): number {
  return wallClockAsUtc(toWallClock(epochMs, timeZone)) - epochMs;
}

/**
 * Instant for a local wall-clock time. Ambiguous times (clocks fall back)
 * resolve to the earlier instant; skipped times (clocks spring forward) move
 * forward by the gap, e.g. 2:30 AM → 3:30 AM. Same as Temporal "compatible".
 */
function fromWallClock(w: WallClock, timeZone: string): number {
  const local = wallClockAsUtc(w);
  const day = 24 * 60 * 60 * 1000;
  const before = zoneOffset(local - day, timeZone);
  const after = zoneOffset(local + day, timeZone);
  const candidates = [local - before, local - after].filter(
    (t) => wallClockAsUtc(toWallClock(t, timeZone)) === local
  );
  if (candidates.length) return Math.min(...candidates);
  return local - before;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Advance an instant by whole days or months on the calendar of `timeZone`,
 * keeping the local clock time. Months clamp to the last day (Jan 31 → Feb 28/29).
 */
export function addCalendarInterval(
  epochMs: number,
  unit: "day" | "month",
  amount: number,
  timeZone: string
): number {
  const w = toWallClock(epochMs, timeZone);
  if (unit === "day") {
    const shifted = new Date(Date.UTC(w.year, w.month - 1, w.day + amount));
    w.year = shifted.getUTCFullYear();
    w.month = shifted.getUTCMonth() + 1;
    w.day = shifted.getUTCDate();
  } else {
    const index = w.year * 12 + (w.month - 1) + amount;
    w.year = Math.floor(index / 12);
    w.month = (index % 12) + 1;
    w.day = Math.min(w.day, daysInMonth(w.year, w.month));
  }
  return fromWallClock(w, timeZone);
}

/** All IANA zones this runtime knows (sorted), for pickers. Empty if unsupported. */
export function listTimeZones(): string[] {
  try {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] }
    ).supportedValuesOf;
    return supportedValuesOf ? [...supportedValuesOf("timeZone")].sort() : [];
  } catch {
    return [];
  }
}

/**
 * Friendly name for a zone, like "Pacific Time" or "Japan Time", falling back
 * to the city from the IANA name ("Los Angeles time") when the runtime only
 * offers a GMT offset.
 */
export function describeTimeZone(timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^(GMT|UTC)[+-−]/.test(name)) return name;
  } catch {
    // fall through
  }
  const city = timeZone.split("/").pop()?.replace(/_/g, " ");
  return city ? `${city} time` : timeZone;
}
