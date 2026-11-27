import type { PriorityLevel, TodoItem } from "./index";

/**
 * How a list's tasks are ordered. Shared by web ("Sort by" on the list page)
 * and mobile (Settings and the list's edit sheet), so both order tasks the same way.
 */
export type TaskSortMode = "created" | "priority" | "reminder" | "alphabetical" | "manual";

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
  { value: "manual", label: "Manual", description: "Your custom order." },
];

export function isTaskSortMode(value: unknown): value is TaskSortMode {
  return (
    value === "created" ||
    value === "priority" ||
    value === "reminder" ||
    value === "alphabetical" ||
    value === "manual"
  );
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

function compareSortOrder(
  a: { sortOrder?: number | null },
  b: { sortOrder?: number | null }
): number {
  const ao = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder) ? a.sortOrder : null;
  const bo = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder) ? b.sortOrder : null;
  if (ao !== null && bo !== null) return ao - bo;
  if (ao !== null) return -1;
  if (bo !== null) return 1;
  return 0;
}

export type SortableTask = Pick<TodoItem, "text" | "priority" | "createdAt"> & {
  reminderAt?: number | null;
  sortOrder?: number | null;
};

/** Compares two tasks on the primary sort key for `mode` (0 when tied or Manual). */
export function compareTaskPrimarySort(
  mode: TaskSortMode,
  a: SortableTask,
  b: SortableTask
): number {
  switch (mode) {
    case "manual":
      return 0;
    case "created":
      return createdTime(b) - createdTime(a);
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
 * Ties use custom `sortOrder` ascending, then newest first, then incoming order.
 * If a task carries `subtasks`, they stay under it and are sorted the same way,
 * so subtasks follow the list's sort too.
 */
export function sortTasks<T extends SortableTask & { subtasks?: SortableTask[] }>(
  tasks: readonly T[],
  mode: TaskSortMode
): T[] {
  return stableSort(
    tasks,
    (a, b) =>
      compareTaskPrimarySort(mode, a, b) ||
      compareSortOrder(a, b) ||
      createdTime(b) - createdTime(a)
  ).map((task) =>
    task.subtasks && task.subtasks.length > 0
      ? ({ ...task, subtasks: sortTasks(task.subtasks, mode) } as T)
      : task
  );
}

/** True when `a` and `b` can be reordered relative to each other under `mode`. */
export function areTasksTiedInSortMode(
  mode: TaskSortMode,
  a: SortableTask,
  b: SortableTask
): boolean {
  return mode === "manual" || compareTaskPrimarySort(mode, a, b) === 0;
}

export function moveItemInArray<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function canMoveTaskInDirection<T extends SortableTask & { id: string }>(
  orderedSiblings: readonly T[],
  taskId: string,
  direction: "up" | "down",
  mode: TaskSortMode
): { canMove: boolean; swapWithId: string | null; orderedIds: string[] | null } {
  const index = orderedSiblings.findIndex((t) => t.id === taskId);
  if (index === -1) return { canMove: false, swapWithId: null, orderedIds: null };
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= orderedSiblings.length) {
    return { canMove: false, swapWithId: null, orderedIds: null };
  }
  const current = orderedSiblings[index];
  const neighbor = orderedSiblings[neighborIndex];
  if (!areTasksTiedInSortMode(mode, current, neighbor)) {
    return { canMove: false, swapWithId: null, orderedIds: null };
  }
  const orderedIds = moveItemInArray(
    orderedSiblings.map((t) => t.id),
    index,
    neighborIndex
  );
  return { canMove: true, swapWithId: neighbor.id, orderedIds };
}

export function hasTiedNeighborInSortMode<T extends SortableTask & { id: string }>(
  orderedSiblings: readonly T[],
  taskId: string,
  mode: TaskSortMode
): boolean {
  return (
    canMoveTaskInDirection(orderedSiblings, taskId, "up", mode).canMove ||
    canMoveTaskInDirection(orderedSiblings, taskId, "down", mode).canMove
  );
}

/**
 * Optimistically applies a slot-preserving reorder within `(parentId ?? null)` scope
 * and assigns dense 0-based `sortOrder` values matching the backend `reorder` action.
 */
export function applyOptimisticReorder<
  T extends {
    id: string;
    parentId?: string | null;
    sortOrder?: number | null;
    createdAt?: number | null;
  },
>(
  todos: readonly T[] | undefined,
  orderedIds: readonly string[],
  parentId?: string | null
): T[] | undefined {
  if (!todos || orderedIds.length === 0) return todos ? [...todos] : todos;
  const targetParent = parentId ?? null;
  const scopeTasks = stableSort(
    todos.filter((t) => (t.parentId ?? null) === targetParent),
    (a, b) => compareSortOrder(a, b) || createdTime(b) - createdTime(a)
  );
  if (scopeTasks.length === 0) return [...todos];

  const uniqueOrdered: string[] = [];
  const seen = new Set<string>();
  const scopeIdSet = new Set(scopeTasks.map((t) => t.id));
  for (const id of orderedIds) {
    if (!seen.has(id) && scopeIdSet.has(id)) {
      seen.add(id);
      uniqueOrdered.push(id);
    }
  }
  if (uniqueOrdered.length === 0) return [...todos];

  const mergedIds: string[] = [];
  let queueIdx = 0;
  for (const row of scopeTasks) {
    if (seen.has(row.id)) {
      mergedIds.push(uniqueOrdered[queueIdx++]);
    } else {
      mergedIds.push(row.id);
    }
  }

  const orderMap = new Map<string, number>();
  mergedIds.forEach((id, idx) => orderMap.set(id, idx));

  return todos.map((item) => {
    const nextOrder = orderMap.get(item.id);
    return nextOrder !== undefined ? { ...item, sortOrder: nextOrder } : item;
  });
}
