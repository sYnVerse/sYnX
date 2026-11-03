import type { PriorityLevel, TodoItem } from "./index";

/**
 * How a list's tasks are ordered. Shared by web ("Sort by" on the list page)
 * and mobile (Settings and the list's edit sheet), so both order tasks the same way.
 */
export type TaskSortMode = "created" | "priority" | "reminder" | "alphabetical";

/** A mobile per-list choice: a sort, or "app_default" to follow the app-wide setting. */
export type TaskSortOverride = TaskSortMode | "app_default";

export const DEFAULT_TASK_SORT_MODE: TaskSortMode = "reminder";

export const TASK_SORT_OPTIONS: { value: TaskSortMode; label: string; description: string }[] = [
  { value: "created", label: "Date Created", description: "Newest first." },
  { value: "priority", label: "Priority", description: "High to low." },
  {
    value: "reminder",
    label: "Reminder Time",
    description: "Soonest reminder first. Tasks without one follow by priority.",
  },
  { value: "alphabetical", label: "Alphabetical", description: "A to Z." },
];

export function isTaskSortMode(value: unknown): value is TaskSortMode {
  return value === "created" || value === "priority" || value === "reminder" || value === "alphabetical";
}

/** The sort a list uses: its own choice if valid, otherwise the fallback. */
export function resolveTaskSortMode(
  fallback: TaskSortMode,
  override: unknown
): TaskSortMode {
  return isTaskSortMode(override) ? override : fallback;
}

/** Web remembers each list's "Sort by" choice in localStorage under this key. */
export function taskSortStorageKey(listId: string): string {
  return `synx_task_sort:${listId}`;
}

const PRIORITY_RANK: Record<PriorityLevel, number> = { high: 3, medium: 2, low: 1, none: 0 };

function priorityRank(priority: PriorityLevel | null | undefined): number {
  return priority ? (PRIORITY_RANK[priority] ?? 0) : 0;
}

/** The task's reminder time in ms, or null when it has none. */
function reminderTime(task: { reminderAt?: number | null }): number | null {
  const at = task.reminderAt;
  return typeof at === "number" && Number.isFinite(at) && at > 0 ? at : null;
}

function createdTime(task: { createdAt?: number | null }): number {
  return typeof task.createdAt === "number" && Number.isFinite(task.createdAt) ? task.createdAt : 0;
}

export type SortableTask = Pick<TodoItem, "text" | "priority" | "createdAt"> & {
  reminderAt?: number | null;
};

function compareMain(mode: TaskSortMode, a: SortableTask, b: SortableTask): number {
  switch (mode) {
    case "priority":
      return priorityRank(b.priority) - priorityRank(a.priority);
    case "alphabetical":
      return (a.text ?? "").localeCompare(b.text ?? "", undefined, { sensitivity: "base" });
    case "reminder": {
      const ar = reminderTime(a);
      const br = reminderTime(b);
      if (ar !== null && br !== null) return ar - br;
      if (ar !== null) return -1;
      if (br !== null) return 1;
      // Neither has a reminder: order by priority.
      return priorityRank(b.priority) - priorityRank(a.priority);
    }
    default:
      return 0;
  }
}

function stableSort<U>(items: readonly U[], compare: (a: U, b: U) => number): U[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((x, y) => compare(x.item, y.item) || x.index - y.index)
    .map(({ item }) => item);
}

/**
 * Returns a sorted copy of tasks without changing the input.
 * Ties fall back to newest first, then to the order the tasks came in.
 * If a task carries `subtasks`, they stay under it and are sorted the same way,
 * so subtasks follow the list's sort too.
 */
export function sortTasks<T extends SortableTask & { subtasks?: SortableTask[] }>(
  tasks: readonly T[],
  mode: TaskSortMode
): T[] {
  return stableSort(
    tasks,
    (a, b) => compareMain(mode, a, b) || createdTime(b) - createdTime(a)
  ).map((task) =>
    task.subtasks && task.subtasks.length > 0
      ? ({ ...task, subtasks: sortTasks(task.subtasks, mode) } as T)
      : task
  );
}
