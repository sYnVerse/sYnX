import { addCalendarInterval, getLocalTimeZone, isValidTimeZone } from "./time-zone";
import type { SubtaskCompletionAction } from "./index";

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

export type SubtaskPromptCandidate = {
  id: string;
  completed: boolean;
  parentId?: string | null;
  pendingDelete?: boolean;
  recurrence?: string | null;
  subtasks?: SubtaskPromptCandidate[];
};

/**
 * Returns incomplete, non-pending-delete subtasks belonging to `parent`,
 * combining `allTodos` (matching `parentId === parent.id`) and `parent.subtasks`
 * without duplicates.
 */
export function getIncompleteSubtasks<
  T extends {
    id: string;
    completed: boolean;
    parentId?: string | null;
    pendingDelete?: boolean;
  },
>(parent: { id: string; subtasks?: readonly T[] }, allTodos?: readonly T[]): T[] {
  const seen = new Set<string>();
  const incomplete: T[] = [];

  const collect = (items: readonly T[] | undefined) => {
    if (!items) return;
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (!item.completed && !item.pendingDelete) {
        incomplete.push(item);
      }
    }
  };

  if (allTodos) {
    collect(allTodos.filter((item) => item.parentId === parent.id));
  }
  collect(parent.subtasks);
  return incomplete;
}

/**
 * True when completing a non-recurring top-level task should prompt the user
 * about its incomplete subtasks.
 */
export function shouldPromptSubtaskCompletion<
  T extends {
    id: string;
    completed: boolean;
    parentId?: string | null;
    pendingDelete?: boolean;
    recurrence?: string | null;
  },
>(
  parent: {
    id: string;
    completed: boolean;
    parentId?: string | null;
    pendingDelete?: boolean;
    recurrence?: string | null;
    subtasks?: readonly T[];
  },
  desiredCompleted: boolean,
  allTodos?: readonly T[]
): boolean {
  if (
    !desiredCompleted ||
    parent.completed ||
    parent.pendingDelete ||
    isRecurring(parent.recurrence)
  ) {
    return false;
  }
  const resolvedParentId =
    parent.parentId ?? allTodos?.find((item) => item.id === parent.id)?.parentId;
  if (resolvedParentId) return false;
  return getIncompleteSubtasks(parent, allTodos).length > 0;
}

/** Formats alert copy for completing or promoting incomplete subtasks. */
export function formatSubtaskCompletionPrompt(incompleteCount: number): {
  title: string;
  message: string;
  completeLabel: string;
  promoteLabel: string;
  cancelLabel: string;
} {
  return {
    title: "Complete subtasks too?",
    message:
      incompleteCount === 1
        ? "This task has 1 incomplete subtask. Would you like to mark it complete too, or keep it open as a top-level task?"
        : `This task has ${incompleteCount} incomplete subtasks. Would you like to mark them complete too, or keep them open as top-level tasks?`,
    completeLabel: "Yes, complete all",
    promoteLabel: "No, keep open",
    cancelLabel: "Cancel",
  };
}

/**
 * Optimistically applies `setCompleted` to a list cache together with either
 * completing all incomplete subtasks (`"complete"`) or promoting them to
 * top-level tasks placed directly after the completed parent (`"promote"`).
 */
export function applySetCompletedWithSubtasksLocal<
  T extends SetCompletedFields & {
    id: string;
    parentId?: string | null;
    pendingDelete?: boolean;
    subtasks?: T[];
  },
>(
  todos: readonly T[] | undefined,
  id: string,
  completed: boolean,
  subtaskAction?: SubtaskCompletionAction,
  timeZone: string | undefined = getLocalTimeZone()
): T[] | undefined {
  if (!todos) return todos;

  const promotedIds = new Set<string>();
  if (completed && subtaskAction === "promote") {
    for (const item of todos) {
      if (item.parentId === id && !item.completed && !item.pendingDelete) {
        promotedIds.add(item.id);
      }
    }
  }

  const promotedFromFlat =
    promotedIds.size > 0
      ? todos
          .filter((item) => promotedIds.has(item.id))
          .map((item) => ({ ...item, parentId: undefined }))
      : [];

  const nextList: T[] = [];

  for (const item of todos) {
    if (promotedIds.has(item.id)) {
      continue;
    }

    if (item.id === id) {
      const updatedParent = applySetCompletedLocal(item, completed, timeZone).todo;
      let nextSubtasks = item.subtasks;
      const promotedFromNested: T[] = [];

      if (completed && updatedParent.completed && subtaskAction === "complete" && item.subtasks) {
        nextSubtasks = item.subtasks.map((st) =>
          !st.completed && !st.pendingDelete ? applySetCompletedLocal(st, true, timeZone).todo : st
        );
      } else if (
        completed &&
        updatedParent.completed &&
        subtaskAction === "promote" &&
        item.subtasks
      ) {
        const kept: T[] = [];
        for (const st of item.subtasks) {
          if (!st.completed && !st.pendingDelete) {
            if (!promotedIds.has(st.id)) {
              promotedFromNested.push({ ...st, parentId: undefined });
            }
          } else {
            kept.push(st);
          }
        }
        nextSubtasks = kept;
      }

      nextList.push(
        nextSubtasks !== undefined ? { ...updatedParent, subtasks: nextSubtasks } : updatedParent
      );
      if (completed && updatedParent.completed && subtaskAction === "promote") {
        nextList.push(...promotedFromFlat, ...promotedFromNested);
      }
      continue;
    }

    if (
      item.parentId === id &&
      completed &&
      subtaskAction === "complete" &&
      !item.completed &&
      !item.pendingDelete
    ) {
      nextList.push(applySetCompletedLocal(item, true, timeZone).todo);
      continue;
    }

    if (item.subtasks?.some((st) => st.id === id)) {
      nextList.push({
        ...item,
        subtasks: item.subtasks.map((st) =>
          st.id === id ? applySetCompletedLocal(st, completed, timeZone).todo : st
        ),
      });
      continue;
    }

    nextList.push(item);
  }

  return nextList;
}
