import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  defaultPickerValue,
  formatReminderPillLabel,
  initialReminderSelection,
  nextFullHour,
  resolveReminderAt,
} from "../shared/reminder-time";

const MIN = 60 * 1000;
// Local-time fixtures so the tests hold in any time zone.
const now = new Date(2026, 9, 26, 14, 10).getTime(); // Mon, Oct 26 2:10 PM
const calendarDay9am = new Date(2026, 10, 8, 9, 0).getTime(); // Sun, Nov 8 9:00 AM

describe("resolveReminderAt", () => {
  it("counts quick pills from now when creating, even from a Calendar day", () => {
    expect(resolveReminderAt({ selection: { kind: "offset", minutes: 15 }, isEditing: false, now })).toBe(
      now + 15 * MIN
    );
    // The Calendar screen's 9 AM default is replaced, not added to.
    expect(
      resolveReminderAt({
        selection: { kind: "offset", minutes: 15 },
        isEditing: false,
        existingReminderAt: calendarDay9am,
        now,
      })
    ).toBe(now + 15 * MIN);
  });

  it("pushes the existing reminder back when editing, and handles none and specific times", () => {
    const existing = new Date(2026, 9, 27, 8, 0).getTime();
    expect(
      resolveReminderAt({ selection: { kind: "offset", minutes: 30 }, isEditing: true, existingReminderAt: existing, now })
    ).toBe(existing + 30 * MIN);
    expect(resolveReminderAt({ selection: { kind: "offset", minutes: 5 }, isEditing: true, now })).toBe(now + 5 * MIN);
    expect(resolveReminderAt({ selection: { kind: "none" }, isEditing: true, now })).toBeNull();
    expect(resolveReminderAt({ selection: { kind: "none" }, isEditing: false, now })).toBeUndefined();
    expect(resolveReminderAt({ selection: initialReminderSelection(calendarDay9am), isEditing: false, now })).toBe(
      calendarDay9am
    );
  });
});

describe("date & time picker helpers", () => {
  it("opens on the current reminder if it's ahead, else the next full hour", () => {
    expect(nextFullHour(now)).toBe(new Date(2026, 9, 26, 15, 0).getTime());
    expect(defaultPickerValue(calendarDay9am, now)).toBe(calendarDay9am);
    expect(defaultPickerValue(now - MIN, now)).toBe(nextFullHour(now));
    expect(defaultPickerValue(undefined, now)).toBe(nextFullHour(now));
  });

  it("combines the picked day and time and labels it compactly", () => {
    const picked = combineDateAndTime(new Date(2026, 10, 8, 14, 10, 33), new Date(2026, 9, 26, 8, 0, 45));
    expect(picked).toBe(new Date(2026, 10, 8, 8, 0, 0).getTime());
    expect(formatReminderPillLabel(picked, "en-US")).toBe("Sun, Nov 8 · 8:00 AM");
  });
});
