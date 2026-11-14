import type { PriorityLevel, TodoItem } from "./index";
import type { TaskSortMode } from "./task-sort";

/** Priority tiers ordered top-to-bottom in Priority sort view. */
export const PRIORITY_LEVELS_DESC: readonly PriorityLevel[] = ["high", "medium", "low", "none"];

export const PRIORITY_DROP_LABELS: Record<PriorityLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

/**
 * Only editable, incomplete top-level tasks can be dragged to change priority
 * while a list is sorted by Priority. Subtasks remain scoped to their parent.
 */
export function canDragTaskForPriority(params: {
  canEdit: boolean;
  sortMode: TaskSortMode;
  task: Pick<TodoItem, "completed" | "parentId" | "pendingDelete">;
}): boolean {
  return (
    params.canEdit &&
    params.sortMode === "priority" &&
    !params.task.completed &&
    !params.task.parentId &&
    !params.task.pendingDelete
  );
}

/**
 * Resolves the target priority level from a vertical drag offset (`dy` px).
 * Dragging upward (`dy < 0`) moves toward High; dragging downward (`dy > 0`)
 * moves toward None.
 */
export function resolvePriorityFromVerticalOffset(
  currentPriority: PriorityLevel | undefined,
  dy: number,
  stepPx = 44
): PriorityLevel {
  const safeStep = Number.isFinite(stepPx) && stepPx > 0 ? stepPx : 44;
  const startIndex = PRIORITY_LEVELS_DESC.indexOf((currentPriority || "none") as PriorityLevel);
  const safeStart = startIndex === -1 ? PRIORITY_LEVELS_DESC.length - 1 : startIndex;
  const steps = Math.round(dy / safeStep);
  const nextIndex = Math.max(0, Math.min(PRIORITY_LEVELS_DESC.length - 1, safeStart + steps));
  return PRIORITY_LEVELS_DESC[nextIndex];
}

/** Optimistically updates a cached task's priority in place. */
export function applyOptimisticTaskPriority<T extends Pick<TodoItem, "id" | "priority">>(
  todos: T[] | undefined,
  taskId: string,
  nextPriority: PriorityLevel
): T[] | undefined {
  if (!todos) return todos;
  return todos.map((task) => (task.id === taskId ? { ...task, priority: nextPriority } : task));
}
