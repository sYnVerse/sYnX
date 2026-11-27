import type { PriorityLevel, TodoItem } from "./index";
import {
  areTasksTiedInSortMode,
  hasTiedNeighborInSortMode,
  moveItemInArray,
  type SortableTask,
  type TaskSortMode,
} from "./task-sort";

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
 * Determines whether `task` can show a drag handle for priority changes and/or reordering.
 */
export function canDragTaskToReorder<T extends SortableTask & Pick<TodoItem, "id" | "completed" | "parentId" | "pendingDelete">>(params: {
  canEdit: boolean;
  sortMode: TaskSortMode;
  task: T;
  activeSiblings: readonly T[];
}): boolean {
  if (!params.canEdit || params.task.completed || params.task.pendingDelete) {
    return false;
  }
  if (params.sortMode === "priority" && !params.task.parentId) {
    return true;
  }
  if (params.sortMode === "manual") {
    return params.activeSiblings.length >= 2;
  }
  return hasTiedNeighborInSortMode(params.activeSiblings, params.task.id, params.sortMode);
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

export type PriorityModeDragOutcome =
  | { kind: "none" }
  | { kind: "priority"; nextPriority: PriorityLevel }
  | {
      kind: "reorder";
      targetIndex: number;
      orderedGroupIds: string[];
      positionInGroup: number;
      groupSize: number;
    };

export type ListReorderDragOutcome =
  | { kind: "none" }
  | {
      kind: "reorder";
      targetIndex: number;
      orderedIds: string[];
      positionInGroup: number;
      groupSize: number;
    };

/**
 * In Priority sort mode, dragging within the task's contiguous same-priority group reorders
 * inside that group; dragging past the group boundary changes priority (including skipping empty tiers).
 */
export function resolvePriorityModeDragOutcome(
  activeTasks: readonly Pick<TodoItem, "id" | "priority">[],
  taskId: string,
  dy: number,
  rowStepPx = 64,
  priorityStepPx = 44
): PriorityModeDragOutcome {
  const safeRowStep = Number.isFinite(rowStepPx) && rowStepPx > 0 ? rowStepPx : 64;
  const idx = activeTasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return { kind: "none" };

  const currentPriority = (activeTasks[idx].priority || "none") as PriorityLevel;
  let groupStart = idx;
  while (groupStart > 0 && (activeTasks[groupStart - 1].priority || "none") === currentPriority) {
    groupStart--;
  }
  let groupEnd = idx;
  while (
    groupEnd < activeTasks.length - 1 &&
    (activeTasks[groupEnd + 1].priority || "none") === currentPriority
  ) {
    groupEnd++;
  }

  if (groupStart === groupEnd) {
    const nextPriority = resolvePriorityFromVerticalOffset(currentPriority, dy, priorityStepPx);
    return nextPriority !== currentPriority ? { kind: "priority", nextPriority } : { kind: "none" };
  }

  const slotDelta = Math.round(dy / safeRowStep);
  const rawTarget = idx + slotDelta;
  const groupIds = activeTasks.slice(groupStart, groupEnd + 1).map((t) => t.id);

  if (rawTarget >= groupStart && rawTarget <= groupEnd) {
    if (rawTarget === idx) return { kind: "none" };
    return {
      kind: "reorder",
      targetIndex: rawTarget,
      orderedGroupIds: moveItemInArray(groupIds, idx - groupStart, rawTarget - groupStart),
      positionInGroup: rawTarget - groupStart + 1,
      groupSize: groupIds.length,
    };
  }

  if (rawTarget < groupStart) {
    const rowsToEdge = idx - groupStart;
    const excessDy = dy + rowsToEdge * safeRowStep;
    const nextPriority = resolvePriorityFromVerticalOffset(
      currentPriority,
      excessDy,
      priorityStepPx
    );
    if (nextPriority !== currentPriority) {
      return { kind: "priority", nextPriority };
    }
    if (groupStart === idx) return { kind: "none" };
    return {
      kind: "reorder",
      targetIndex: groupStart,
      orderedGroupIds: moveItemInArray(groupIds, idx - groupStart, 0),
      positionInGroup: 1,
      groupSize: groupIds.length,
    };
  }

  const rowsToEdge = groupEnd - idx;
  const excessDy = dy - rowsToEdge * safeRowStep;
  const nextPriority = resolvePriorityFromVerticalOffset(currentPriority, excessDy, priorityStepPx);
  if (nextPriority !== currentPriority) {
    return { kind: "priority", nextPriority };
  }
  if (groupEnd === idx) return { kind: "none" };
  return {
    kind: "reorder",
    targetIndex: groupEnd,
    orderedGroupIds: moveItemInArray(groupIds, idx - groupStart, groupIds.length - 1),
    positionInGroup: groupIds.length,
    groupSize: groupIds.length,
  };
}

/**
 * Resolves a reorder drag in Manual mode (free movement across active siblings) or non-Manual modes
 * (clamped to contiguous siblings that tie on the mode's primary sort key).
 */
export function resolveListReorderDragOutcome<T extends SortableTask & { id: string }>(
  activeSiblings: readonly T[],
  taskId: string,
  dy: number,
  sortMode: TaskSortMode,
  rowStepPx = 64
): ListReorderDragOutcome {
  const safeRowStep = Number.isFinite(rowStepPx) && rowStepPx > 0 ? rowStepPx : 64;
  const idx = activeSiblings.findIndex((t) => t.id === taskId);
  if (idx === -1 || activeSiblings.length < 2) return { kind: "none" };

  let groupStart = idx;
  let groupEnd = idx;
  if (sortMode === "manual") {
    groupStart = 0;
    groupEnd = activeSiblings.length - 1;
  } else {
    while (groupStart > 0 && areTasksTiedInSortMode(sortMode, activeSiblings[groupStart - 1], activeSiblings[idx])) {
      groupStart--;
    }
    while (
      groupEnd < activeSiblings.length - 1 &&
      areTasksTiedInSortMode(sortMode, activeSiblings[groupEnd + 1], activeSiblings[idx])
    ) {
      groupEnd++;
    }
  }

  if (groupStart === groupEnd) return { kind: "none" };

  const slotDelta = Math.round(dy / safeRowStep);
  const clampedTarget = Math.max(groupStart, Math.min(groupEnd, idx + slotDelta));
  if (clampedTarget === idx) return { kind: "none" };

  const orderedIds = moveItemInArray(
    activeSiblings.map((t) => t.id),
    idx,
    clampedTarget
  );
  return {
    kind: "reorder",
    targetIndex: clampedTarget,
    orderedIds,
    positionInGroup: clampedTarget - groupStart + 1,
    groupSize: groupEnd - groupStart + 1,
  };
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
