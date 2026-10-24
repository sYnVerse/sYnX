/** True when a task repeats on a schedule (not "none"). */
export function isRecurring(recurrence?: string | null): boolean {
  return Boolean(recurrence && recurrence !== "none");
}

/** Next reminder timestamp for a recurrence pattern. */
export function nextReminderAt(
  currentReminderAt: number | undefined | null,
  recurrence: string
): number {
  const current = currentReminderAt || Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  if (recurrence === "daily") return current + oneDay;
  if (recurrence === "weekly") return current + 7 * oneDay;
  if (recurrence === "monthly") {
    const date = new Date(current);
    date.setMonth(date.getMonth() + 1);
    return date.getTime();
  }
  return current;
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
 */
export function applySetCompletedLocal<T extends SetCompletedFields>(
  todo: T,
  completed: boolean
): SetCompletedLocalResult<T> {
  if (completed && isRecurring(todo.recurrence)) {
    const next = nextReminderAt(todo.reminderAt, String(todo.recurrence));
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
