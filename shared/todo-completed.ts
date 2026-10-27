import { addCalendarInterval, getLocalTimeZone, isValidTimeZone } from "./time-zone";

/** True when a task repeats on a schedule (not "none"). */
export function isRecurring(recurrence?: string | null): boolean {
  return Boolean(recurrence && recurrence !== "none");
}

/**
 * Next reminder timestamp for a recurrence pattern.
 *
 * With a valid IANA `timeZone`, daily/weekly/monthly repeats keep the same
 * local clock time across daylight saving changes (9:00 AM stays 9:00 AM),
 * and monthly repeats clamp to the end of shorter months (Jan 31 → Feb 28/29).
 * Without one, repeats advance on the UTC calendar: a fixed 24 hours / 7 days,
 * which matches the behavior before time zones were known.
 */
export function nextReminderAt(
  currentReminderAt: number | undefined | null,
  recurrence: string,
  timeZone?: string | null
): number {
  const current = currentReminderAt || Date.now();
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
  const step =
    recurrence === "daily"
      ? { unit: "day" as const, amount: 1 }
      : recurrence === "weekly"
        ? { unit: "day" as const, amount: 7 }
        : recurrence === "monthly"
          ? { unit: "month" as const, amount: 1 }
          : null;
  if (!step) return current;
  try {
    return addCalendarInterval(current, step.unit, step.amount, zone);
  } catch {
    // Runtime without Intl time zone data: fixed-interval fallback.
    const oneDay = 24 * 60 * 60 * 1000;
    if (step.unit === "day") return current + step.amount * oneDay;
    const date = new Date(current);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.getTime();
  }
}

export type SetCompletedFields = {
  completed: boolean;
  reminderAt?: number;
  reminderSent?: boolean;
  recurrence?: string | null;
};

export type SetCompletedLocalResult<T extends SetCompletedFields> = {
  todo: T;
  rescheduled: boolean;
};

/**
 * Pure local/optimistic application of an explicit done state.
 * Recurring tasks requested as done advance the reminder and stay uncompleted.
 * Runs on the device/browser, so it defaults to the local time zone, matching
 * what the server does with the user's stored zone.
 */
export function applySetCompletedLocal<T extends SetCompletedFields>(
  todo: T,
  completed: boolean,
  timeZone: string | undefined = getLocalTimeZone()
): SetCompletedLocalResult<T> {
  if (completed && isRecurring(todo.recurrence)) {
    const next = nextReminderAt(todo.reminderAt, String(todo.recurrence), timeZone);
    return {
      todo: {
        ...todo,
        completed: false,
        reminderAt: next,
        reminderSent: false,
      },
      rescheduled: true,
    };
  }

  if (Boolean(todo.completed) === Boolean(completed)) {
    return { todo, rescheduled: false };
  }

  return { todo: { ...todo, completed: Boolean(completed) }, rescheduled: false };
}
