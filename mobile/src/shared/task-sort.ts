import type { PriorityLevel, TodoItem } from "./index";

/** How tasks in a list are ordered on mobile. */
export type TaskSortMode = "due_time" | "priority" | "alphabetical";

/** A per-list choice: a sort, or "app_default" to follow the app-wide setting. */
export type TaskSortOverride = TaskSortMode | "app_default";

export const DEFAULT_TASK_SORT_MODE: TaskSortMode = "due_time";

export const TASK_SORT_OPTIONS: { value: TaskSortMode; label: string; description: string }[] = [
  {
    value: "due_time",
    label: "Due time",
    description: "Tasks with a reminder first, soonest first. The rest by priority.",
  },
  { value: "priority", label: "Priority", description: "High to low." },
  { value: "alphabetical", label: "Alphabetical", description: "A to Z." },
];

export function isTaskSortMode(value: unknown): value is TaskSortMode {
  return value === "due_time" || value === "priority" || value === "alphabetical";
}

/** The sort a list uses: its own override if set, otherwise the app-wide sort. */
export function resolveTaskSortMode(
  appDefault: TaskSortMode,
  override: TaskSortOverride | null | undefined
): TaskSortMode {
  return isTaskSortMode(override) ? override : appDefault;
}

const PRIORITY_RANK: Record<PriorityLevel, number> = { high: 3, medium: 2, low: 1, none: 0 };

function priorityRank(priority: PriorityLevel | null | undefined): number {
  return priority ? (PRIORITY_RANK[priority] ?? 0) : 0;
}

/** The task's reminder time in ms, or null when it has none. */
function reminderTime(task: Pick<TodoItem, "reminderAt">): number | null {
  return typeof task.reminderAt === "number" && Number.isFinite(task.reminderAt) ? task.reminderAt : null;
}

type SortableTask = Pick<TodoItem, "text" | "priority" | "reminderAt">;

function compareTasks(mode: TaskSortMode, a: SortableTask, b: SortableTask): number {
  if (mode === "alphabetical") {
    const at = (a.text ?? "").toLowerCase();
    const bt = (b.text ?? "").toLowerCase();
    return at < bt ? -1 : at > bt ? 1 : 0;
  }
  if (mode === "due_time") {
    const ar = reminderTime(a);
    const br = reminderTime(b);
    if (ar !== null && br !== null) return ar - br;
    if (ar !== null) return -1;
    if (br !== null) return 1;
    // Neither has a reminder: fall back to priority.
  }
  return priorityRank(b.priority) - priorityRank(a.priority);
}

function sortFlat<U extends SortableTask>(tasks: readonly U[], mode: TaskSortMode): U[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((x, y) => compareTasks(mode, x.task, y.task) || x.index - y.index)
    .map(({ task }) => task);
}

/**
 * Returns a sorted copy of `tasks` without changing the input. Ties keep the
 * order the tasks came in. Each task's `subtasks` are sorted the same way and
 * stay under their parent.
 */
export function sortTasks<T extends SortableTask & { subtasks?: SortableTask[] }>(
  tasks: readonly T[],
  mode: TaskSortMode
): T[] {
  return sortFlat(tasks, mode).map((task) =>
    task.subtasks && task.subtasks.length > 0
      ? ({ ...task, subtasks: sortFlat(task.subtasks, mode) } as T)
      : task
  );
}
