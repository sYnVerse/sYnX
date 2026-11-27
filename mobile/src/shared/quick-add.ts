import * as chronoEn from "chrono-node/en";
import type { PriorityLevel, RecurrencePattern } from "./index";
import {
  addCalendarInterval,
  fromWallClock,
  getLocalTimeZone,
  isValidTimeZone,
  toWallClock,
} from "./time-zone";

export type QuickAddMatchKind = "date" | "recurrence" | "priority" | "duration";

export interface QuickAddMatch {
  kind: QuickAddMatchKind;
  text: string;
  start: number;
  end: number;
}

export interface QuickAddFeatures {
  /** Master kill-switch (maps to Settings toggle). Defaults to true. */
  enabled?: boolean;
  date?: boolean;
  recurrence?: boolean;
  priority?: boolean;
  duration?: boolean;
}

export interface ParseQuickAddOptions {
  /** Current reference time in epoch ms (defaults to Date.now()). */
  now?: number;
  /** Selected calendar day ("YYYY-MM-DD" or epoch ms) used for time-only phrases. */
  baseDay?: string | number | null;
  /** IANA time zone name (falls back to device/local zone, then UTC). */
  timeZone?: string | null;
  /** Hour (0-23) implied when a date has no time. Defaults to 9 (9:00 AM). */
  defaultHour?: number;
  /** Feature flags per token kind or master switch. */
  features?: QuickAddFeatures;
  /** Phrases (or `"kind:phrase"`) explicitly dismissed by the user. */
  dismissed?: Iterable<string>;
}

export interface QuickAddResult {
  title: string;
  reminderAt: number | null;
  recurrence: RecurrencePattern | null;
  priority: PriorityLevel | null;
  durationMinutes: number | null;
  matches: QuickAddMatch[];
}

const WEEKDAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MAX_DURATION_MINUTES = 24 * 60;

function normalizeDismissedSet(dismissed?: Iterable<string>): Set<string> {
  const out = new Set<string>();
  if (!dismissed) return out;
  for (const raw of dismissed) {
    const clean = String(raw).trim().toLowerCase();
    if (clean) out.add(clean);
  }
  return out;
}

function isMatchDismissed(
  dismissed: Set<string>,
  kind: QuickAddMatchKind,
  rawSlice: string,
  corePhrase?: string
): boolean {
  if (dismissed.size === 0) return false;
  const full = rawSlice.trim().toLowerCase();
  if (dismissed.has(full) || dismissed.has(`${kind}:${full}`)) return true;
  if (corePhrase) {
    const core = corePhrase.trim().toLowerCase();
    if (dismissed.has(core) || dismissed.has(`${kind}:${core}`)) return true;
  }
  return false;
}

function maskSpan(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i++) {
    chars[i] = " ";
  }
}

function maskDoubleQuotedSpans(chars: string[], text: string): void {
  const quoteRegex = /"[^"]*"/g;
  let match: RegExpExecArray | null;
  while ((match = quoteRegex.exec(text)) !== null) {
    maskSpan(chars, match.index, match.index + match[0].length);
  }
}

function parseBaseDayParts(
  baseDay: string | number | null | undefined,
  zone: string
): { year: number; month: number; day: number } | null {
  if (baseDay == null || baseDay === "") return null;
  if (typeof baseDay === "number" && Number.isFinite(baseDay)) {
    const wc = toWallClock(baseDay, zone);
    return { year: wc.year, month: wc.month, day: wc.day };
  }
  if (typeof baseDay === "string") {
    const trimmed = baseDay.trim();
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (isoMatch) {
      return {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      };
    }
    const parsedMs = Date.parse(trimmed);
    if (!Number.isNaN(parsedMs)) {
      const wc = toWallClock(parsedMs, zone);
      return { year: wc.year, month: wc.month, day: wc.day };
    }
  }
  return null;
}

function weekdayOfCalendarDate(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function compareCalendarDates(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number }
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function shiftCalendarDays(
  cal: { year: number; month: number; day: number },
  deltaDays: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(cal.year, cal.month - 1, cal.day + deltaDays));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function futureDayBareHour(rawHour1To12: number): number {
  if (rawHour1To12 === 12) return 12;
  if (rawHour1To12 >= 1 && rawHour1To12 <= 7) return rawHour1To12 + 12;
  return rawHour1To12;
}

function nextWeekdayWallClock(
  fromMs: number,
  targetWeekday: number,
  hour: number,
  minute: number,
  zone: string
): number {
  const todayWc = toWallClock(fromMs, zone);
  const todayWeekday = weekdayOfCalendarDate(todayWc.year, todayWc.month, todayWc.day);
  let delta = (targetWeekday - todayWeekday + 7) % 7;
  const candidateCal = shiftCalendarDays(todayWc, delta);
  const candidateMs = fromWallClock(
    {
      ...candidateCal,
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    zone
  );
  if (delta === 0 && candidateMs <= fromMs) {
    delta = 7;
    const nextCal = shiftCalendarDays(todayWc, delta);
    return fromWallClock(
      { ...nextCal, hour, minute, second: 0, millisecond: 0 },
      zone
    );
  }
  return candidateMs;
}

function parsePriorityToken(token: string): PriorityLevel | null {
  switch (token.toLowerCase()) {
    case "!high":
    case "p1":
      return "high";
    case "!med":
    case "!medium":
    case "p2":
      return "medium";
    case "!low":
    case "p3":
      return "low";
    default:
      return null;
  }
}

function findPriorityMatch(
  workText: string,
  dismissed: Set<string>
): { priority: PriorityLevel; match: QuickAddMatch } | null {
  const regex = /(?:^|(?<=[\s({,]))(!high|!medium|!med|!low|p[123])(?=$|[\s)\]},.!?;:])/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(workText)) !== null) {
    const token = m[1];
    const priority = parsePriorityToken(token);
    if (!priority) continue;
    const start = m.index;
    const end = start + token.length;
    if (isMatchDismissed(dismissed, "priority", token)) continue;
    return {
      priority,
      match: { kind: "priority", text: token, start, end },
    };
  }
  return null;
}

function findDurationMatch(
  workText: string,
  dismissed: Set<string>
): { durationMinutes: number; match: QuickAddMatch } | null {
  const regex =
    /(?:^|(?<=[\s({,]))(for\s+(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)(?:\s+(\d+)\s*(?:minutes?|mins?|m))?|(\d+)\s*(?:minutes?|mins?|m)))(?=$|[\s)\]},.!?;:])/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(workText)) !== null) {
    const raw = m[1];
    let totalMinutes = 0;
    if (m[2] !== undefined) {
      totalMinutes = Math.round(parseFloat(m[2]) * 60);
      if (m[3] !== undefined) {
        totalMinutes += parseInt(m[3], 10);
      }
    } else if (m[4] !== undefined) {
      totalMinutes = parseInt(m[4], 10);
    }
    if (!Number.isFinite(totalMinutes) || totalMinutes < 1 || totalMinutes > MAX_DURATION_MINUTES) {
      continue;
    }
    const start = m.index;
    const end = start + raw.length;
    if (isMatchDismissed(dismissed, "duration", raw)) continue;
    return {
      durationMinutes: totalMinutes,
      match: { kind: "duration", text: raw, start, end },
    };
  }
  return null;
}

function findRecurrenceMatch(
  workText: string,
  dismissed: Set<string>
): { recurrence: RecurrencePattern; weekday: number | null; match: QuickAddMatch } | null {
  const regex =
    /(?:^|(?<=[\s({,]))(every\s+(?:other\s+week\b|weekday\b|(?:(day|week|month|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)))|everyday|daily|weekly|monthly)(?=$|[\s)\]},.!?;:])/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(workText)) !== null) {
    const raw = m[1];
    const lower = raw.toLowerCase();
    // Explicitly out of scope per spec.
    if (/^every\s+(?:other\s+week|weekday)\b/.test(lower)) continue;

    let recurrence: RecurrencePattern | null = null;
    let weekday: number | null = null;

    if (lower === "daily" || lower === "everyday" || /^every\s+day$/.test(lower)) {
      recurrence = "daily";
    } else if (lower === "weekly" || /^every\s+week$/.test(lower)) {
      recurrence = "weekly";
    } else if (lower === "monthly" || /^every\s+month$/.test(lower)) {
      recurrence = "monthly";
    } else if (m[2]) {
      const wd = WEEKDAY_NAMES[m[2].toLowerCase()];
      if (wd !== undefined) {
        recurrence = "weekly";
        weekday = wd;
      }
    }

    if (!recurrence) continue;
    const start = m.index;
    const end = start + raw.length;
    if (isMatchDismissed(dismissed, "recurrence", raw)) continue;
    return {
      recurrence,
      weekday,
      match: { kind: "recurrence", text: raw, start, end },
    };
  }
  return null;
}

function stripLeadingPrepositionStart(workText: string, dateStart: number): number {
  const before = workText.slice(0, dateStart);
  const m = /(?:^|(?<=[\s({,]))(?:at|on|by)\s+$/i.exec(before);
  if (!m) return dateStart;
  return m.index;
}

function isExplicit24HourClock(rawDateText: string, rawHour: number): boolean {
  if (rawHour === 0 || rawHour >= 13) return true;
  if (/\b0\d:\d{2}\b/.test(rawDateText)) return true;
  if (/\b2[0-3]:\d{2}\b/.test(rawDateText)) return true;
  return false;
}

function resolveChronoDateResult(
  text: string,
  workText: string,
  now: number,
  zone: string,
  defaultHour: number,
  baseDayCal: { year: number; month: number; day: number } | null,
  dismissed: Set<string>
): { reminderAt: number; match: QuickAddMatch; hasExplicitDate: boolean } | null {
  const refWc = toWallClock(now, zone);
  const refLocal = new Date(
    refWc.year,
    refWc.month - 1,
    refWc.day,
    refWc.hour,
    refWc.minute,
    refWc.second,
    0
  );

  // Use strict? No: casual supports "tomorrow", "next Tue", "in 2 weeks", etc.
  const results = chronoEn.casual.parse(workText, refLocal, { forwardDate: true });
  for (const res of results) {
    const startComp = res.start;
    const rawCore = res.text;

    // Skip noisy bare implied words like "Morning" or "Evening" with zero certain
    // components (e.g. "Morning walk tomorrow at 9am" should parse "tomorrow at 9am").
    const meaningfulComponents: readonly chronoEn.Component[] = [
      "year",
      "month",
      "day",
      "weekday",
      "hour",
      "minute",
      "second",
      "meridiem",
    ];
    if (!meaningfulComponents.some((c) => startComp.isCertain(c))) {
      continue;
    }

    // Ignore bare month names with no day, weekday, or time (e.g. "May report").
    if (
      startComp.isCertain("month") &&
      !startComp.isCertain("day") &&
      !startComp.isCertain("hour") &&
      !startComp.isCertain("weekday")
    ) {
      continue;
    }

    // Chrono's relative parser treats "for 15m" / "for 1h" as "in 15m",
    // whereas sYnX treats "for <duration>" as duration (never a reminder offset).
    // Skip these so dismissing a duration chip never turns it into a reminder.
    const tags = res.tags();
    if (
      (tags.has("result/relativeDate") || tags.has("result/relativeDateAndTime")) &&
      /^for\s+/i.test(rawCore.trim())
    ) {
      continue;
    }

    const leadingWs = rawCore.length - rawCore.trimStart().length;
    const trimmedCore = rawCore.trim();
    if (!trimmedCore) {
      continue;
    }
    const coreIndex = res.index + leadingWs;
    const removalStart = stripLeadingPrepositionStart(workText, coreIndex);
    const removalEnd = coreIndex + trimmedCore.length;
    const matchedSlice = text.slice(removalStart, removalEnd);

    if (isMatchDismissed(dismissed, "date", matchedSlice, trimmedCore)) {
      continue;
    }

    // Relative offset phrases:
    // - minute/hour offsets track elapsed clock time across DST
    // - day/week/month offsets preserve wall-clock time across DST
    const relMatch =
      /^in\s+(\d+)\s+(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?)$/i.exec(
        trimmedCore
      );
    if (relMatch) {
      const amount = parseInt(relMatch[1], 10);
      const unit = relMatch[2].toLowerCase();
      let reminderAt: number;
      if (unit.startsWith("m") && !unit.startsWith("mo")) {
        reminderAt = now + amount * 60_000;
      } else if (unit.startsWith("h")) {
        reminderAt = now + amount * 3_600_000;
      } else if (unit.startsWith("d")) {
        reminderAt = addCalendarInterval(now, "day", amount, zone);
      } else if (unit.startsWith("w")) {
        reminderAt = addCalendarInterval(now, "day", amount * 7, zone);
      } else {
        reminderAt = addCalendarInterval(now, "month", amount, zone);
      }
      return {
        reminderAt,
        match: { kind: "date", text: matchedSlice, start: removalStart, end: removalEnd },
        hasExplicitDate: true,
      };
    }

    const hasCasualKeywordTime =
      tags.has("casualReference/tonight") ||
      tags.has("casualReference/noon") ||
      tags.has("casualReference/midnight");
    const hasExplicitCalendarDate =
      startComp.isCertain("day") ||
      startComp.isCertain("month") ||
      startComp.isCertain("year") ||
      startComp.isCertain("weekday");
    const hasExplicitHour = startComp.isCertain("hour") || hasCasualKeywordTime;
    const hasExplicitMeridiem = startComp.isCertain("meridiem") || hasCasualKeywordTime;

    let targetCal: { year: number; month: number; day: number };
    if (hasExplicitCalendarDate) {
      targetCal = {
        year: startComp.get("year") ?? refWc.year,
        month: startComp.get("month") ?? refWc.month,
        day: startComp.get("day") ?? refWc.day,
      };
    } else if (baseDayCal) {
      targetCal = { ...baseDayCal };
    } else {
      targetCal = { year: refWc.year, month: refWc.month, day: refWc.day };
    }

    let targetHour = hasExplicitHour ? (startComp.get("hour") ?? defaultHour) : defaultHour;
    const targetMinute = hasExplicitHour ? (startComp.get("minute") ?? 0) : 0;
    const targetSecond = hasExplicitHour ? (startComp.get("second") ?? 0) : 0;

    // Normalize same-day weekday (e.g., typing "Friday" on a Friday without "next"):
    // keep today if target time is still ahead, otherwise move to next week (+7d).
    const todayCal = { year: refWc.year, month: refWc.month, day: refWc.day };
    if (
      startComp.isCertain("weekday") &&
      !startComp.isCertain("day") &&
      !startComp.isCertain("month") &&
      !/\bnext\b/i.test(rawCore)
    ) {
      const mentionedWeekday = startComp.get("weekday");
      const todayWeekday = weekdayOfCalendarDate(todayCal.year, todayCal.month, todayCal.day);
      if (mentionedWeekday === todayWeekday) {
        targetCal = { ...todayCal };
      }
    }

    let resolvedMs: number | null = null;

    if (hasExplicitHour && !hasExplicitMeridiem && !isExplicit24HourClock(rawCore, targetHour)) {
      const bareH = targetHour % 12 === 0 ? 12 : targetHour % 12;
      const dayCmp = compareCalendarDates(targetCal, todayCal);
      if (dayCmp > 0) {
        targetHour = futureDayBareHour(bareH);
      } else if (dayCmp === 0) {
        // Always pick the next upcoming occurrence today, or roll to tomorrow.
        const amHour = bareH === 12 ? 0 : bareH;
        const amMs = fromWallClock(
          { ...targetCal, hour: amHour, minute: targetMinute, second: targetSecond, millisecond: 0 },
          zone
        );
        if (amMs > now) {
          resolvedMs = amMs;
        } else {
          const pmHour = bareH === 12 ? 12 : bareH + 12;
          const pmMs = fromWallClock(
            { ...targetCal, hour: pmHour, minute: targetMinute, second: targetSecond, millisecond: 0 },
            zone
          );
          if (pmMs > now) {
            resolvedMs = pmMs;
          } else {
            const tomorrowCal = shiftCalendarDays(targetCal, 1);
            resolvedMs = fromWallClock(
              {
                ...tomorrowCal,
                hour: futureDayBareHour(bareH),
                minute: targetMinute,
                second: targetSecond,
                millisecond: 0,
              },
              zone
            );
          }
        }
      } else {
        targetHour = futureDayBareHour(bareH);
      }
    }

    if (resolvedMs === null) {
      resolvedMs = fromWallClock(
        {
          ...targetCal,
          hour: targetHour,
          minute: targetMinute,
          second: targetSecond,
          millisecond: 0,
        },
        zone
      );

      // If this was a weekday matching today (no "next"), roll +7 days if <= now.
      if (
        startComp.isCertain("weekday") &&
        !startComp.isCertain("day") &&
        !startComp.isCertain("month") &&
        !/\bnext\b/i.test(rawCore) &&
        compareCalendarDates(targetCal, todayCal) === 0 &&
        resolvedMs <= now
      ) {
        const nextWeekCal = shiftCalendarDays(targetCal, 7);
        resolvedMs = fromWallClock(
          {
            ...nextWeekCal,
            hour: targetHour,
            minute: targetMinute,
            second: targetSecond,
            millisecond: 0,
          },
          zone
        );
      } else if (
        // Time-only phrase with no explicit date and not pinned to a past/future baseDay:
        !hasExplicitCalendarDate &&
        !baseDayCal &&
        hasExplicitMeridiem &&
        resolvedMs <= now
      ) {
        const tomorrowCal = shiftCalendarDays(todayCal, 1);
        resolvedMs = fromWallClock(
          {
            ...tomorrowCal,
            hour: targetHour,
            minute: targetMinute,
            second: targetSecond,
            millisecond: 0,
          },
          zone
        );
      }
    }

    const hasRelativeDayOrOffsetTag =
      tags.has("result/relativeDate") ||
      tags.has("result/relativeDateAndTime") ||
      tags.has("casualReference/today") ||
      tags.has("casualReference/tomorrow") ||
      tags.has("casualReference/yesterday");

    return {
      reminderAt: resolvedMs,
      match: {
        kind: "date",
        text: matchedSlice,
        start: removalStart,
        end: removalEnd,
      },
      hasExplicitDate: hasExplicitCalendarDate || hasRelativeDayOrOffsetTag,
    };
  }

  return null;
}

function buildCleanedTitle(text: string, matches: QuickAddMatch[]): string {
  if (matches.length === 0) return text.trim();
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const m of sorted) {
    if (m.start > cursor) {
      out += text.slice(cursor, m.start);
    }
    if (m.end > cursor) {
      cursor = m.end;
    }
  }
  if (cursor < text.length) {
    out += text.slice(cursor);
  }
  const cleaned = out.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : text.trim();
}

export function parseQuickAdd(
  text: string,
  options: ParseQuickAddOptions = {}
): QuickAddResult {
  const empty: QuickAddResult = {
    title: text ? text.trim() : "",
    reminderAt: null,
    recurrence: null,
    priority: null,
    durationMinutes: null,
    matches: [],
  };

  if (!text || !text.trim()) return empty;
  if (options.features?.enabled === false) return empty;

  const now = options.now ?? Date.now();
  const defaultHour = options.defaultHour ?? 9;
  const zone = isValidTimeZone(options.timeZone)
    ? options.timeZone
    : (getLocalTimeZone() ?? "UTC");
  const dismissed = normalizeDismissedSet(options.dismissed);
  const features = options.features ?? {};
  const baseDayCal = parseBaseDayParts(options.baseDay, zone);

  const workChars = Array.from(text);
  maskDoubleQuotedSpans(workChars, text);

  const matches: QuickAddMatch[] = [];
  let priority: PriorityLevel | null = null;
  let durationMinutes: number | null = null;
  let recurrence: RecurrencePattern | null = null;
  let recurrenceWeekday: number | null = null;
  let reminderAt: number | null = null;

  if (features.priority !== false) {
    const found = findPriorityMatch(workChars.join(""), dismissed);
    if (found) {
      priority = found.priority;
      matches.push(found.match);
      maskSpan(workChars, found.match.start, found.match.end);
    }
  }

  if (features.duration !== false) {
    const found = findDurationMatch(workChars.join(""), dismissed);
    if (found) {
      durationMinutes = found.durationMinutes;
      matches.push(found.match);
      maskSpan(workChars, found.match.start, found.match.end);
    }
  }

  if (features.recurrence !== false) {
    const found = findRecurrenceMatch(workChars.join(""), dismissed);
    if (found) {
      recurrence = found.recurrence;
      recurrenceWeekday = found.weekday;
      matches.push(found.match);
      maskSpan(workChars, found.match.start, found.match.end);
    }
  }

  if (features.date !== false) {
    // Prevent out-of-scope recurrence phrases from having substrings (like "weekday")
    // mis-parsed as dates by chrono.
    const dateWorkChars = [...workChars];
    const currentWork = dateWorkChars.join("");
    const outOfScopeRegex = /(?:^|(?<=[\s({,]))every\s+(?:other\s+week|weekday)(?=$|[\s)\]},.!?;:])/gi;
    let ignored: RegExpExecArray | null;
    while ((ignored = outOfScopeRegex.exec(currentWork)) !== null) {
      maskSpan(dateWorkChars, ignored.index, ignored.index + ignored[0].length);
    }

    const found = resolveChronoDateResult(
      text,
      dateWorkChars.join(""),
      now,
      zone,
      defaultHour,
      baseDayCal,
      dismissed
    );
    if (found) {
      reminderAt = found.reminderAt;
      // If "every <Weekday>" supplied a weekday and the date parser only saw a
      // time-of-day without an explicit calendar date or relative offset, align
      // the reminder to that weekday.
      if (recurrenceWeekday !== null && reminderAt !== null && !found.hasExplicitDate) {
        const resWc = toWallClock(reminderAt, zone);
        reminderAt = nextWeekdayWallClock(
          now,
          recurrenceWeekday,
          resWc.hour,
          resWc.minute,
          zone
        );
      }
      matches.push(found.match);
    } else if (recurrenceWeekday !== null) {
      reminderAt = nextWeekdayWallClock(now, recurrenceWeekday, defaultHour, 0, zone);
    }
  }

  matches.sort((a, b) => a.start - b.start);

  return {
    title: buildCleanedTitle(text, matches),
    reminderAt,
    recurrence,
    priority,
    durationMinutes,
    matches,
  };
}
