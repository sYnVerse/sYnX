import { describe, expect, it } from "vitest";
import sharedIndexRaw from "../shared/index.ts?raw";
import { toWallClock, fromWallClock } from "../shared/time-zone";
import { parseQuickAdd } from "../shared/quick-add";

const LA = "America/Los_Angeles";

/** Build UTC epoch ms for a local wall-clock instant in America/Los_Angeles. */
function la(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  return fromWallClock({ year, month, day, hour, minute, second, millisecond: 0 }, LA);
}

function wall(ms: number | null, zone = LA) {
  expect(ms).not.toBeNull();
  const w = toWallClock(ms!, zone);
  return {
    year: w.year,
    month: w.month,
    day: w.day,
    hour: w.hour,
    minute: w.minute,
  };
}

describe("shared/quick-add parser (#98)", () => {
  it("is not re-exported from shared/index.ts to keep chrono-node out of API/cron/widgets", () => {
    expect(sharedIndexRaw).not.toContain("quick-add");
    expect(sharedIndexRaw).not.toContain("chrono-node");
  });

  // Base reference: Fri Nov 6, 2026 10:00 AM PST
  const baseNow = la(2026, 11, 6, 10, 0);

  describe("table-driven parsing rules", () => {
    const cases: Array<{
      name: string;
      input: string;
      now?: number;
      baseDay?: string | null;
      expected: {
        title: string;
        reminderWall?: { year: number; month: number; day: number; hour: number; minute: number } | null;
        recurrence?: string | null;
        priority?: string | null;
        durationMinutes?: number | null;
      };
    }> = [
      {
        name: "headline exam date + time",
        input: "Security+ exam Nov 8 8am",
        now: la(2026, 11, 1, 12, 0),
        expected: {
          title: "Security+ exam",
          reminderWall: { year: 2026, month: 11, day: 8, hour: 8, minute: 0 },
          recurrence: null,
          priority: null,
          durationMinutes: null,
        },
      },
      {
        name: "date-only input defaults to 9:00 AM",
        input: "Pay rent tomorrow",
        expected: {
          title: "Pay rent",
          reminderWall: { year: 2026, month: 11, day: 7, hour: 9, minute: 0 },
        },
      },
      {
        name: "relative next weekday (Tue from Fri Nov 6)",
        input: "Dentist next Tue 2:30pm",
        expected: {
          title: "Dentist",
          reminderWall: { year: 2026, month: 11, day: 10, hour: 14, minute: 30 },
        },
      },
      {
        name: "priority !high / !med / !low",
        input: "Submit taxes !high",
        expected: { title: "Submit taxes", priority: "high" },
      },
      {
        name: "priority !med",
        input: "Review PR !med",
        expected: { title: "Review PR", priority: "medium" },
      },
      {
        name: "priority p1 / p2 / p3",
        input: "Triage incident p1",
        expected: { title: "Triage incident", priority: "high" },
      },
      {
        name: "priority p2 and duration for 30m",
        input: "Write specs p2 for 30m",
        expected: { title: "Write specs", priority: "medium", durationMinutes: 30 },
      },
      {
        name: "priority p3 and duration for 1h 30m",
        input: "Deep work p3 for 1h 30m",
        expected: { title: "Deep work", priority: "low", durationMinutes: 90 },
      },
      {
        name: "token boundary ignores p10",
        input: "Inspect p10 invoice",
        expected: { title: "Inspect p10 invoice", priority: null },
      },
      {
        name: "daily recurrence + time",
        input: "Take vitamins daily at 8am",
        expected: {
          title: "Take vitamins",
          recurrence: "daily",
          reminderWall: { year: 2026, month: 11, day: 7, hour: 8, minute: 0 },
        },
      },
      {
        name: "every week recurrence",
        input: "Clean desk every week",
        expected: { title: "Clean desk", recurrence: "weekly", reminderWall: null },
      },
      {
        name: "every Monday recurrence sets next Monday 9am",
        input: "Team sync every Monday",
        expected: {
          title: "Team sync",
          recurrence: "weekly",
          reminderWall: { year: 2026, month: 11, day: 9, hour: 9, minute: 0 },
        },
      },
      {
        name: "monthly recurrence",
        input: "Pay mortgage monthly",
        expected: { title: "Pay mortgage", recurrence: "monthly", reminderWall: null },
      },
      {
        name: "out-of-scope every weekday and every other week stay literal",
        input: "Standup every weekday",
        expected: { title: "Standup every weekday", recurrence: null },
      },
      {
        name: "out-of-scope every other week stays literal",
        input: "1:1 every other week",
        expected: { title: "1:1 every other week", recurrence: null },
      },
      {
        name: "month name with no day or time is ignored",
        input: "May report due for 45m",
        expected: { title: "May report due", reminderWall: null, durationMinutes: 45 },
      },
      {
        name: "quotes keep text literal",
        input: 'Send "tomorrow" memo !low',
        expected: { title: 'Send "tomorrow" memo', reminderWall: null, priority: "low" },
      },
      {
        name: "prepositions at/on/by are removed with the date token",
        input: "Finish slides by Nov 10 at 4pm",
        expected: {
          title: "Finish slides",
          reminderWall: { year: 2026, month: 11, day: 10, hour: 16, minute: 0 },
        },
      },
      {
        name: "if removing tokens leaves nothing, full text stays title",
        input: "tomorrow",
        expected: {
          title: "tomorrow",
          reminderWall: { year: 2026, month: 11, day: 7, hour: 9, minute: 0 },
        },
      },
      {
        name: "baseDay used for time-only phrase on CalendarScreen",
        input: "2pm standup",
        baseDay: "2026-11-18",
        expected: {
          title: "standup",
          reminderWall: { year: 2026, month: 11, day: 18, hour: 14, minute: 0 },
        },
      },
      {
        name: "explicit date replaces baseDay",
        input: "Dentist tomorrow 10am",
        baseDay: "2026-11-18",
        expected: {
          title: "Dentist",
          reminderWall: { year: 2026, month: 11, day: 7, hour: 10, minute: 0 },
        },
      },
    ];

    for (const tc of cases) {
      it(tc.name, () => {
        const res = parseQuickAdd(tc.input, {
          now: tc.now ?? baseNow,
          baseDay: tc.baseDay,
          timeZone: LA,
        });
        expect(res.title).toBe(tc.expected.title);
        if (tc.expected.reminderWall !== undefined) {
          if (tc.expected.reminderWall === null) {
            expect(res.reminderAt).toBeNull();
          } else {
            expect(wall(res.reminderAt)).toEqual(tc.expected.reminderWall);
          }
        }
        if (tc.expected.recurrence !== undefined) {
          expect(res.recurrence).toBe(tc.expected.recurrence);
        }
        if (tc.expected.priority !== undefined) {
          expect(res.priority).toBe(tc.expected.priority);
        }
        if (tc.expected.durationMinutes !== undefined) {
          expect(res.durationMinutes).toBe(tc.expected.durationMinutes);
        }
      });
    }
  });

  describe("bare hour and same-day weekday decisions", () => {
    it("bare hour picks next upcoming occurrence on the same day, or rolls to tomorrow", () => {
      // 8:00 AM -> "at 9" => today 9:00 AM
      expect(wall(parseQuickAdd("Call Bob at 9", { now: la(2026, 11, 6, 8, 0), timeZone: LA }).reminderAt)).toEqual({
        year: 2026,
        month: 11,
        day: 6,
        hour: 9,
        minute: 0,
      });

      // 8:00 AM -> "at 3" => today 3:00 AM past, picks today 3:00 PM
      expect(wall(parseQuickAdd("Call Bob at 3", { now: la(2026, 11, 6, 8, 0), timeZone: LA }).reminderAt)).toEqual({
        year: 2026,
        month: 11,
        day: 6,
        hour: 15,
        minute: 0,
      });

      // 2:00 AM -> "at 3" => today 3:00 AM is upcoming!
      expect(wall(parseQuickAdd("Call Bob at 3", { now: la(2026, 11, 6, 2, 0), timeZone: LA }).reminderAt)).toEqual({
        year: 2026,
        month: 11,
        day: 6,
        hour: 3,
        minute: 0,
      });

      // 5:00 PM -> "at 3" => rolls to tomorrow 3:00 PM (1-7 => PM)
      expect(wall(parseQuickAdd("Call Bob at 3", { now: la(2026, 11, 6, 17, 0), timeZone: LA }).reminderAt)).toEqual({
        year: 2026,
        month: 11,
        day: 7,
        hour: 15,
        minute: 0,
      });

      // 10:00 PM -> "at 9" => rolls to tomorrow 9:00 AM (8-11 => AM)
      expect(wall(parseQuickAdd("Call Bob at 9", { now: la(2026, 11, 6, 22, 0), timeZone: LA }).reminderAt)).toEqual({
        year: 2026,
        month: 11,
        day: 7,
        hour: 9,
        minute: 0,
      });

      // "tomorrow at 3" => always 3:00 PM regardless of current hour
      expect(
        wall(parseQuickAdd("Call Bob tomorrow at 3", { now: la(2026, 11, 6, 2, 0), timeZone: LA }).reminderAt)
      ).toEqual({
        year: 2026,
        month: 11,
        day: 7,
        hour: 15,
        minute: 0,
      });
    });

    it("same-day weekday uses today if ahead, otherwise next week", () => {
      // Friday 8:00 AM, typing "Friday" (default 9:00 AM is ahead) => today Friday Nov 6
      expect(
        wall(parseQuickAdd("Report Friday", { now: la(2026, 11, 6, 8, 0), timeZone: LA }).reminderAt)
      ).toEqual({ year: 2026, month: 11, day: 6, hour: 9, minute: 0 });

      // Friday 10:00 AM, typing "Friday" (9:00 AM has passed) => next Friday Nov 13
      expect(
        wall(parseQuickAdd("Report Friday", { now: la(2026, 11, 6, 10, 0), timeZone: LA }).reminderAt)
      ).toEqual({ year: 2026, month: 11, day: 13, hour: 9, minute: 0 });

      // Friday 10:00 AM, typing "Friday 4pm" => today Friday Nov 6 4pm
      expect(
        wall(parseQuickAdd("Report Friday 4pm", { now: la(2026, 11, 6, 10, 0), timeZone: LA }).reminderAt)
      ).toEqual({ year: 2026, month: 11, day: 6, hour: 16, minute: 0 });
    });
  });

  describe("DST transitions (America/Los_Angeles)", () => {
    const dstCases: Array<{
      name: string;
      now: number;
      input: string;
      expectedWall: { year: number; month: number; day: number; hour: number; minute: number };
      expectedElapsedHours?: number;
    }> = [
      {
        // Spring forward: Sun Mar 8, 2026 2:00 AM PST -> 3:00 AM PDT
        name: "tomorrow preserves 9:00 AM wall clock across Spring Forward",
        now: la(2026, 3, 7, 9, 0),
        input: "Morning walk tomorrow at 9am",
        expectedWall: { year: 2026, month: 3, day: 8, hour: 9, minute: 0 },
      },
      {
        name: "in 2 weeks preserves 9:00 AM wall clock across Spring Forward",
        now: la(2026, 3, 7, 9, 0),
        input: "Dentist in 2 weeks",
        expectedWall: { year: 2026, month: 3, day: 21, hour: 9, minute: 0 },
      },
      {
        name: "in 2 hours advances exact elapsed hours across Spring Forward (01:30 PST -> 04:30 PDT)",
        now: la(2026, 3, 8, 1, 30),
        input: "Check oven in 2 hours",
        expectedWall: { year: 2026, month: 3, day: 8, hour: 4, minute: 30 },
        expectedElapsedHours: 2,
      },
      {
        // Fall back: Sun Nov 1, 2026 2:00 AM PDT -> 1:00 AM PST
        name: "tomorrow preserves 9:00 AM wall clock across Fall Back",
        now: la(2026, 10, 31, 9, 0),
        input: "Call mom tomorrow at 9am",
        expectedWall: { year: 2026, month: 11, day: 1, hour: 9, minute: 0 },
      },
      {
        name: "in 2 weeks preserves 10:00 AM wall clock across Fall Back",
        now: la(2026, 10, 25, 10, 0),
        input: "Review in 2 weeks",
        expectedWall: { year: 2026, month: 11, day: 8, hour: 10, minute: 0 },
      },
      {
        name: "in 2 hours advances exact elapsed hours across Fall Back (01:30 PDT -> 02:30 PST)",
        now: la(2026, 11, 1, 1, 30),
        input: "Shut off sprinklers in 2 hours",
        expectedWall: { year: 2026, month: 11, day: 1, hour: 2, minute: 30 },
        expectedElapsedHours: 2,
      },
    ];

    for (const tc of dstCases) {
      it(tc.name, () => {
        const res = parseQuickAdd(tc.input, { now: tc.now, timeZone: LA });
        expect(wall(res.reminderAt)).toEqual(tc.expectedWall);
        if (tc.expectedElapsedHours !== undefined) {
          expect(res.reminderAt! - tc.now).toBe(tc.expectedElapsedHours * 3_600_000);
        }
      });
    }
  });

  describe("features switch and dismissed phrases", () => {
    it("returns raw text unchanged when features.enabled is false", () => {
      const res = parseQuickAdd("Pay rent tomorrow !high for 15m daily", {
        now: baseNow,
        timeZone: LA,
        features: { enabled: false },
      });
      expect(res).toEqual({
        title: "Pay rent tomorrow !high for 15m daily",
        reminderAt: null,
        recurrence: null,
        priority: null,
        durationMinutes: null,
        matches: [],
      });
    });

    it("restores dismissed tokens into title while keeping remaining matches", () => {
      const res = parseQuickAdd("Pay rent tomorrow !high for 30m", {
        now: baseNow,
        timeZone: LA,
        dismissed: ["tomorrow"],
      });
      expect(res.title).toBe("Pay rent tomorrow");
      expect(res.reminderAt).toBeNull();
      expect(res.priority).toBe("high");
      expect(res.durationMinutes).toBe(30);
    });

    it("never converts dismissed 'for <duration>' phrases into relative date reminders", () => {
      const dismissedDuration = parseQuickAdd("Call Mom for 15m", {
        now: baseNow,
        timeZone: LA,
        dismissed: ["duration:for 15m"],
      });
      expect(dismissedDuration).toEqual({
        title: "Call Mom for 15m",
        reminderAt: null,
        recurrence: null,
        priority: null,
        durationMinutes: null,
        matches: [],
      });

      const dismissedAll = parseQuickAdd("2pm standup weekly for 15m !med", {
        now: baseNow,
        baseDay: "2026-11-16",
        timeZone: LA,
        dismissed: ["priority:!med", "duration:for 15m", "recurrence:weekly", "date:2pm"],
      });
      expect(dismissedAll).toEqual({
        title: "2pm standup weekly for 15m !med",
        reminderAt: null,
        recurrence: null,
        priority: null,
        durationMinutes: null,
        matches: [],
      });

      // Relative "in 15m" and "for tomorrow" still parse reminders as expected.
      const inRes = parseQuickAdd("Call Mom in 15m", { now: baseNow, timeZone: LA });
      expect(inRes.reminderAt).toBe(baseNow + 15 * 60_000);
      const forTomorrow = parseQuickAdd("Call Mom for tomorrow", { now: baseNow, timeZone: LA });
      expect(wall(forTomorrow.reminderAt)).toEqual({
        year: 2026,
        month: 11,
        day: 7,
        hour: 9,
        minute: 0,
      });

      // Explicit relative day/week offsets and ISO dates are never snapped onto the "every <Weekday>" day,
      // and trailing masked recurrence spaces are excluded from date match spans.
      const inThreeWeeks = parseQuickAdd("Task in 3 weeks every Monday", {
        now: Date.parse("2026-10-20T10:00:00Z"),
        timeZone: "UTC",
      });
      expect(inThreeWeeks.reminderAt).toBe(Date.parse("2026-11-10T10:00:00Z"));
      expect(inThreeWeeks.recurrence).toBe("weekly");

      const inOneDay = parseQuickAdd("Task in 1 day every Monday", {
        now: Date.parse("2026-11-06T10:00:00Z"),
        timeZone: "UTC",
      });
      expect(inOneDay.reminderAt).toBe(Date.parse("2026-11-07T10:00:00Z"));
      expect(inOneDay.recurrence).toBe("weekly");

      const isoDate = parseQuickAdd("Task 2026-11-21 every Monday", {
        now: Date.parse("2026-11-20T10:00:00Z"),
        timeZone: "UTC",
      });
      expect(isoDate.reminderAt).toBe(Date.parse("2026-11-21T09:00:00Z"));
      expect(isoDate.recurrence).toBe("weekly");

      const monthDay = parseQuickAdd("Task Nov 25 every Monday", {
        now: Date.parse("2026-11-20T10:00:00Z"),
        timeZone: "UTC",
      });
      expect(monthDay.reminderAt).toBe(Date.parse("2026-11-25T09:00:00Z"));
      expect(monthDay.matches).toEqual([
        { kind: "date", text: "Nov 25", start: 5, end: 11 },
        { kind: "recurrence", text: "every Monday", start: 12, end: 24 },
      ]);
    });
  });
});
