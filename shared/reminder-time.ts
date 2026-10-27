import { formatFriendlyDate, formatReminderTime } from "./mobile-ux";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * What the task sheet's reminder row currently has selected.
 * - `none`: no reminder (clears an existing one when editing).
 * - `offset`: one of the quick pills (+5m, +15m, +30m, +60m).
 * - `at`: a specific date and time, from the date & time picker, the task's
 *   existing reminder, or the day picked on the Calendar screen.
 */
export type ReminderSelection =
  | { kind: "none" }
  | { kind: "offset"; minutes: number }
  | { kind: "at"; timestamp: number };

/** Selection a task sheet opens with: the reminder it was given, or none. */
export function initialReminderSelection(initialReminderAt?: number | null): ReminderSelection {
  return initialReminderAt != null && Number.isFinite(initialReminderAt)
    ? { kind: "at", timestamp: initialReminderAt }
    : { kind: "none" };
}

export interface ResolveReminderInput {
  selection: ReminderSelection;
  /** True when editing an existing task, false when creating one. */
  isEditing: boolean;
  /** The task's existing reminder (editing only). */
  existingReminderAt?: number | null;
  now?: number;
}

/**
 * Reminder timestamp to save.
 * Quick pills count from now when creating a task (including from the Calendar
 * screen). When editing, they push the existing reminder back, falling back to
 * now if the task had none. `none` returns `null` when editing (clears it) and
 * `undefined` when creating (no reminder).
 */
export function resolveReminderAt(input: ResolveReminderInput): number | null | undefined {
  const { selection, isEditing, existingReminderAt } = input;
  const now = input.now ?? Date.now();
  switch (selection.kind) {
    case "none":
      return isEditing ? null : undefined;
    case "at":
      return selection.timestamp;
    case "offset": {
      const base = isEditing && existingReminderAt != null ? existingReminderAt : now;
      return base + selection.minutes * MINUTE_MS;
    }
  }
}

/** Start of the next full hour after `now`, e.g. 2:10 PM → 3:00 PM. */
export function nextFullHour(now: number = Date.now()): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.getTime() + HOUR_MS;
}

/**
 * Value the date & time picker opens on: the current reminder if it is still
 * in the future, otherwise the next full hour.
 */
export function defaultPickerValue(current: number | null | undefined, now: number = Date.now()): number {
  return current != null && current > now ? current : nextFullHour(now);
}

/** Calendar day from `datePart` with the hour and minute from `timePart` (seconds zeroed), in local time. */
export function combineDateAndTime(datePart: Date | number, timePart: Date | number): number {
  const day = new Date(datePart);
  const time = new Date(timePart);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
    0,
    0
  ).getTime();
}

/** Compact pill label for a specific reminder, e.g. "Sun, Nov 8 · 8:00 AM". */
export function formatReminderPillLabel(timestamp: number, locale?: string): string {
  return `${formatFriendlyDate(timestamp, locale)} · ${formatReminderTime(timestamp, locale)}`;
}

/** Whether the locale formats times on a 24-hour clock, so the time picker matches the labels. */
export function prefers24HourClock(locale?: string): boolean {
  try {
    const options = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions();
    if (typeof options.hour12 === "boolean") return !options.hour12;
    return options.hourCycle === "h23" || options.hourCycle === "h24";
  } catch {
    return false;
  }
}
