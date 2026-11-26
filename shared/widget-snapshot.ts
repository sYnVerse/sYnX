import { TodoItem, TodoList } from "./index";
import {
  formatWidgetReminderLabel,
  listOwnershipLabel,
  stripLeadingCategoryEmoji,
} from "./mobile-ux";
import { applySetCompletedLocal } from "./todo-completed";
import { DEFAULT_TASK_SORT_MODE, sortTasks, type TaskSortMode } from "./task-sort";
import { countTaskProgress } from "./task-progress";
import { getCategoryEmoji } from "./categories";

/** How long checked-off tasks remain in place on a list widget with an Undo control (~10s). */
export const WIDGET_UNDO_WINDOW_MS = 10_000;
/** Minimum gap between two accepted complete taps on the same widget (~800ms). */
export const WIDGET_DOUBLE_TAP_GUARD_MS = 800;

export interface WidgetTaskItem {
  id: string;
  text: string;
  completed: boolean;
  priority: "high" | "medium" | "low" | "none";
  recurrence: "none" | "daily" | "weekly" | "monthly";
  reminderAt?: number;
  reminderLabel?: string;
  isOverdue?: boolean;
  isRunning?: boolean;
  subtaskProgress?: string;
  /** Set while checked off on the widget and held in place for the undo window. */
  pendingCompletedAt?: number;
}

export interface WidgetPendingOp {
  todoId: string;
  listId: string;
  completed: boolean;
  at: number;
  opId?: string;
}

export interface ListWidgetSnapshot {
  listId: string;
  listTitle: string;
  categoryEmoji: string;
  canEdit: boolean;
  isOwner: boolean;
  ownershipLabel: string;
  tasks: WidgetTaskItem[];
  doneCount: number;
  totalCount: number;
  pendingOps: WidgetPendingOp[];
  isLoggedIn: boolean;
  lastUpdated: number;
  /** Epoch ms of the last accepted complete tap on this widget (800ms double-tap guard). */
  lastTapAt?: number;
}

export interface ProgressWidgetSnapshot {
  listId: string;
  listTitle: string;
  canEdit: boolean;
  doneCount: number;
  totalCount: number;
  progressPercent: number;
  nextTaskText?: string;
  isLoggedIn: boolean;
  lastUpdated: number;
}

export interface BuildSnapshotOptions {
  maxTasks?: number;
  now?: number;
  /**
   * How to order the list's open tasks, so the widget matches the app's list.
   * The caller resolves it (the list's own sort, else the app-wide setting).
   * Defaults to the app default, Reminder Time.
   */
  sortMode?: TaskSortMode;
  /**
   * Optional locale for formatting dates and times (e.g. "en-US").
   */
  locale?: string;
}

/**
 * Builds standard snapshot props for CurrentListWidget or PinnedListWidget.
 */
export function buildListWidgetSnapshot(
  listMeta: TodoList | null | undefined,
  todos: TodoItem[] | null | undefined,
  options?: BuildSnapshotOptions
): ListWidgetSnapshot {
  const now = options?.now ?? Date.now();
  const maxTasks = options?.maxTasks ?? 20;

  if (!listMeta) {
    return {
      listId: "",
      listTitle: "sYnX",
      categoryEmoji: "📋",
      canEdit: false,
      isOwner: false,
      ownershipLabel: "",
      tasks: [],
      doneCount: 0,
      totalCount: 0,
      pendingOps: [],
      isLoggedIn: false,
      lastUpdated: now,
    };
  }

  const allTodos = todos || [];
  const topLevelTasks: TodoItem[] = [];
  const subtasksByParent: Record<string, TodoItem[]> = {};

  let totalCount = 0;
  let doneCount = 0;

  for (const t of allTodos) {
    totalCount++;
    if (t.completed) {
      doneCount++;
    }
    if (t.parentId) {
      if (!subtasksByParent[t.parentId]) {
        subtasksByParent[t.parentId] = [];
      }
      subtasksByParent[t.parentId].push(t);
    } else {
      topLevelTasks.push(t);
    }
  }

  // Same order as the app's list for this sort.
  const openTopLevel = sortTasks(
    topLevelTasks.filter((t) => !t.completed),
    options?.sortMode ?? DEFAULT_TASK_SORT_MODE
  );

  const widgetTasks: WidgetTaskItem[] = openTopLevel.slice(0, maxTasks).map((t) => {
    const subtasks = subtasksByParent[t.id] || [];
    const doneSub = subtasks.filter((s) => s.completed).length;
    const subtaskProgress = subtasks.length > 0 ? `${doneSub}/${subtasks.length}` : undefined;
    const isOverdue = Boolean(t.reminderAt && t.reminderAt < now);
    const reminderLabel = t.reminderAt
      ? formatWidgetReminderLabel(t.reminderAt, now, options?.locale)
      : undefined;

    return {
      id: t.id,
      text: t.text,
      completed: false,
      priority: t.priority || "none",
      recurrence: t.recurrence || "none",
      reminderAt: t.reminderAt,
      reminderLabel,
      isOverdue,
      isRunning: t.startedAt ? true : undefined,
      subtaskProgress,
    };
  });

  const isOwner = listMeta.isOwner !== false;
  const ownership = listOwnershipLabel(isOwner, listMeta.owner?.displayName);

  return {
    listId: listMeta.id,
    // The widget header shows the emoji itself, so drop it from the name to avoid "📋 📋 Various".
    listTitle: stripLeadingCategoryEmoji(listMeta.name, getCategoryEmoji(listMeta.category)) || listMeta.name,
    categoryEmoji: getCategoryEmoji(listMeta.category),
    canEdit: listMeta.canEdit !== false,
    isOwner,
    ownershipLabel: ownership,
    tasks: widgetTasks,
    doneCount,
    totalCount,
    pendingOps: [],
    isLoggedIn: true,
    lastUpdated: now,
  };
}

/**
 * Builds snapshot for Up Next reminders view (filters to tasks with future or overdue reminders).
 */
export function buildUpNextWidgetSnapshot(
  listMeta: TodoList | null | undefined,
  todos: TodoItem[] | null | undefined,
  options?: BuildSnapshotOptions
): ListWidgetSnapshot {
  const now = options?.now ?? Date.now();
  const maxTasks = options?.maxTasks ?? 20;

  const base = buildListWidgetSnapshot(listMeta, todos, options);
  if (!base.isLoggedIn) return base;

  // Filter tasks to those with reminders, sorted chronologically
  const reminderTasks = (todos || [])
    .filter((t) => !t.completed && t.reminderAt != null)
    .sort((a, b) => (a.reminderAt || 0) - (b.reminderAt || 0))
    .slice(0, maxTasks)
    .map((t) => {
      const isOverdue = Boolean(t.reminderAt && t.reminderAt < now);
      return {
        id: t.id,
        text: t.text,
        completed: false,
        priority: t.priority || "none",
        recurrence: t.recurrence || "none",
        reminderAt: t.reminderAt,
        reminderLabel: t.reminderAt
          ? formatWidgetReminderLabel(t.reminderAt, now, options?.locale)
          : undefined,
        isOverdue,
        isRunning: t.startedAt ? true : undefined,
      };
    });

  return {
    ...base,
    listTitle: `${base.listTitle} — Up Next`,
    categoryEmoji: "⏰",
    tasks: reminderTasks,
  };
}

/**
 * Builds snapshot for ListProgressWidget (progress ring + next task).
 */
export function buildProgressWidgetSnapshot(
  listMeta: TodoList | null | undefined,
  todos: TodoItem[] | null | undefined,
  options?: { now?: number; sortMode?: TaskSortMode }
): ProgressWidgetSnapshot {
  const now = options?.now ?? Date.now();

  if (!listMeta) {
    return {
      listId: "",
      listTitle: "sYnX",
      canEdit: false,
      doneCount: 0,
      totalCount: 0,
      progressPercent: 0,
      isLoggedIn: false,
      lastUpdated: now,
    };
  }

  const allTodos = todos || [];
  const {
    done: doneCount,
    total: totalCount,
    percent: progressPercent,
  } = countTaskProgress(allTodos);

  // The next task is the first open task in the list's order, the one the app shows on top.
  const openTasks = sortTasks(
    allTodos.filter((t) => !t.completed && !t.parentId),
    options?.sortMode ?? DEFAULT_TASK_SORT_MODE
  );

  const nextTaskText = openTasks.length > 0 ? openTasks[0].text : undefined;

  return {
    listId: listMeta.id,
    listTitle: listMeta.name,
    canEdit: listMeta.canEdit !== false,
    doneCount,
    totalCount,
    progressPercent,
    nextTaskText,
    isLoggedIn: true,
    lastUpdated: now,
  };
}

/**
 * Safely extracts validated pendingOps from raw widget props.
 */
export function extractPendingWidgetOps(rawProps: { pendingOps?: unknown } | Record<string, unknown> | null | undefined): WidgetPendingOp[] {
  if (!rawProps || !Array.isArray(rawProps.pendingOps)) {
    return [];
  }
  const ops: WidgetPendingOp[] = [];
  for (const rawItem of rawProps.pendingOps) {
    const item = rawItem as Record<string, unknown> | null | undefined;
    if (
      item &&
      typeof item.todoId === "string" &&
      typeof item.listId === "string" &&
      typeof item.completed === "boolean" &&
      typeof item.at === "number"
    ) {
      const op: WidgetPendingOp = {
        todoId: item.todoId,
        listId: item.listId,
        completed: item.completed,
        at: item.at,
      };
      if (typeof item.opId === "string" && item.opId.trim().length > 0) {
        op.opId = item.opId;
      }
      ops.push(op);
    }
  }
  return ops;
}

/**
 * Deduplicates pending ops by todoId, preserving the latest action.
 */
export function reconcileWidgetPendingOps(ops: WidgetPendingOp[]): WidgetPendingOp[] {
  if (!ops.length) return [];
  const sorted = [...ops].sort((a, b) => a.at - b.at);
  const byId = new Map<string, WidgetPendingOp>();
  for (const op of sorted) {
    byId.set(op.todoId, op);
  }
  return Array.from(byId.values());
}

/**
 * Pure function to apply a task checkoff inside widget interaction.
 */
export function applyWidgetTaskCompletion(
  tasks: WidgetTaskItem[],
  todoId: string,
  now?: number,
  locale?: string
): { updatedTasks: WidgetTaskItem[]; completedTask: WidgetTaskItem | null } {
  let found: WidgetTaskItem | null = null;
  const nextTasks: WidgetTaskItem[] = [];

  for (const t of tasks) {
    if (t.id === todoId) {
      found = t;
      const res = applySetCompletedLocal(t, true);
      if (!res.rescheduled) {
        // Normal completion: removed from open tasks in widget
        continue;
      }
      // Recurring task: reminder was advanced, keep in list with new reminderAt
      nextTasks.push({
        ...t,
        reminderAt: res.todo.reminderAt,
        reminderLabel: res.todo.reminderAt
          ? formatWidgetReminderLabel(res.todo.reminderAt, now, locale)
          : undefined,
        isRunning: undefined,
      });
    } else {
      nextTasks.push(t);
    }
  }

  return { updatedTasks: nextTasks, completedTask: found };
}

/**
 * Prepares snapshot props for the native widget bridge.
 *
 * Expo's Android bridge can't convert `undefined`. It rejects the whole
 * `updateSnapshot` call ("Value is undefined, expected an Object"), and the
 * widget never gets data. This drops undefined fields, removes undefined array
 * items, and turns non-finite numbers into null, recursing through nested
 * objects and arrays. Every `updateSnapshot` call should go through this.
 */
export function toNativeWidgetProps<T>(value: T): T {
  return sanitizeWidgetValue(value) as T;
}

function sanitizeWidgetValue(value: unknown): unknown {
  if (value === undefined || typeof value === "function") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map(sanitizeWidgetValue)
      .filter((item) => item !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const clean = sanitizeWidgetValue(entry);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Result of replaying one queued widget checkoff against the API. */
export type WidgetReplayOutcome =
  | { op: WidgetPendingOp; status: "applied"; todo?: TodoItem }
  | { op: WidgetPendingOp; status: "rejected" }
  | { op: WidgetPendingOp; status: "retry" };

/**
 * Classifies a failed replay. Client errors other than 401/408/429 (for example
 * the task was deleted, or edit access was removed) can never succeed, so they
 * are dropped. Everything else (offline, timeouts, server errors, an expired
 * session) stays queued and is retried on the next drain.
 */
export function classifyWidgetReplayError(status: number | undefined | null): "rejected" | "retry" {
  if (typeof status !== "number") return "retry";
  if (status === 401 || status === 408 || status === 429) return "retry";
  return status >= 400 && status < 500 ? "rejected" : "retry";
}

function sameWidgetOp(a: WidgetPendingOp, b: WidgetPendingOp): boolean {
  return (
    a.todoId === b.todoId &&
    a.listId === b.listId &&
    a.completed === b.completed &&
    a.at === b.at &&
    (a.opId ?? undefined) === (b.opId ?? undefined)
  );
}

/**
 * Removes the ops that were handled (applied or permanently rejected) from a
 * widget's queue, keeping anything queued while the replay was running and
 * anything that still needs a retry.
 */
export function removeHandledWidgetOps(
  pendingOps: WidgetPendingOp[],
  handled: WidgetPendingOp[]
): WidgetPendingOp[] {
  if (!handled.length) return pendingOps;
  return pendingOps.filter((op) => !handled.some((h) => sameWidgetOp(op, h)));
}

export interface MergePendingOpsOptions {
  /**
   * Currently displayed widget snapshot, used to keep recently checked rows in place,
   * preserve row order while check-offs are pending, and retain `lastTapAt`.
   */
  previousSnapshot?: Partial<ListWidgetSnapshot> | null;
  /** Current wall-clock timestamp (ms). Defaults to `Date.now()`. */
  now?: number;
  /**
   * How long recently checked tasks remain in place with Undo.
   * Defaults to `WIDGET_UNDO_WINDOW_MS` (10s). Pass `0` to flush immediately (e.g. when opening the app).
   */
  undoWindowMs?: number;
}

function omitPendingCompletedAt(task: WidgetTaskItem): WidgetTaskItem {
  if (!("pendingCompletedAt" in task)) return task;
  const clean = { ...task };
  delete clean.pendingCompletedAt;
  return clean;
}

/**
 * Carries a widget's still-queued checkoffs and in-place undo rows into a freshly
 * built snapshot.
 *
 * Rebuilding a widget from server or cache data must not erase taps that have
 * not reached the server yet, nor jump rows out from under the user's finger
 * during the ~10-second undo window.
 */
export function mergePendingOpsIntoSnapshot(
  snapshot: ListWidgetSnapshot,
  pendingOps: WidgetPendingOp[],
  options?: MergePendingOpsOptions
): ListWidgetSnapshot {
  if (!snapshot.isLoggedIn || !snapshot.listId) {
    return { ...snapshot, pendingOps: [] };
  }

  const now = options?.now ?? Date.now();
  const undoWindowMs = options?.undoWindowMs ?? WIDGET_UNDO_WINDOW_MS;
  const prevSnap =
    options?.previousSnapshot && options.previousSnapshot.listId === snapshot.listId
      ? options.previousSnapshot
      : null;
  const prevTasks: WidgetTaskItem[] = Array.isArray(prevSnap?.tasks) ? prevSnap.tasks : [];

  const latest = new Map<string, WidgetPendingOp>();
  for (const op of reconcileWidgetPendingOps(pendingOps)) {
    if (op.listId === snapshot.listId) latest.set(op.todoId, op);
  }

  const pendingCompleteAtById = new Map<string, number>();
  for (const [todoId, op] of latest) {
    if (op.completed) {
      pendingCompleteAtById.set(todoId, op.at);
    }
  }
  for (const prevTask of prevTasks) {
    if (typeof prevTask.pendingCompletedAt === "number") {
      const op = latest.get(prevTask.id);
      if (op && !op.completed) continue;
      const existing = pendingCompleteAtById.get(prevTask.id);
      pendingCompleteAtById.set(
        prevTask.id,
        existing !== undefined ? Math.max(existing, prevTask.pendingCompletedAt) : prevTask.pendingCompletedAt
      );
    }
  }

  let latestPendingCompleteAt: number | null = null;
  for (const at of pendingCompleteAtById.values()) {
    if (latestPendingCompleteAt === null || at > latestPendingCompleteAt) {
      latestPendingCompleteAt = at;
    }
  }

  const insideUndoWindow =
    undoWindowMs > 0 &&
    latestPendingCompleteAt !== null &&
    latestPendingCompleteAt + undoWindowMs > now;

  const freshById = new Map<string, WidgetTaskItem>();
  for (const t of snapshot.tasks) {
    freshById.set(t.id, t);
  }
  const prevById = new Map<string, WidgetTaskItem>();
  for (const t of prevTasks) {
    prevById.set(t.id, t);
  }

  let doneCount = snapshot.doneCount;
  for (const task of snapshot.tasks) {
    const op = latest.get(task.id);
    if (op?.completed && !isRecurringWidgetTask(task)) {
      doneCount += 1;
    }
  }
  for (const [todoId, op] of latest) {
    if (!op.completed && !freshById.has(todoId)) {
      const prev = prevById.get(todoId);
      if (prev && !isRecurringWidgetTask(prev)) {
        doneCount = Math.max(0, doneCount - 1);
      }
    }
  }

  const hasUnreplayedComplete = Array.from(latest.values()).some((o) => o.completed);
  const preserveOrder = prevTasks.length > 0 && (insideUndoWindow || hasUnreplayedComplete);

  const materializeTask = (id: string): WidgetTaskItem | null => {
    const fresh = freshById.get(id);
    const prev = prevById.get(id);
    const op = latest.get(id);
    const pendingAt = pendingCompleteAtById.get(id);

    if (op && !op.completed) {
      const base = fresh ?? prev;
      if (!base) return null;
      return omitPendingCompletedAt({ ...base, completed: false });
    }

    if (pendingAt !== undefined) {
      if (insideUndoWindow) {
        const base = prev ?? fresh;
        if (!base) return null;
        return { ...base, completed: true, pendingCompletedAt: pendingAt };
      }
      if (op?.completed) {
        return null;
      }
      return fresh ? omitPendingCompletedAt({ ...fresh, completed: false }) : null;
    }

    return fresh ? omitPendingCompletedAt(fresh) : null;
  };

  const mergedTasks: WidgetTaskItem[] = [];
  const seenIds = new Set<string>();
  const maxRows = 20;

  if (preserveOrder) {
    for (const prev of prevTasks) {
      const item = materializeTask(prev.id);
      if (item) {
        mergedTasks.push(item);
        seenIds.add(prev.id);
      }
    }
    for (const fresh of snapshot.tasks) {
      if (seenIds.has(fresh.id) || mergedTasks.length >= maxRows) continue;
      const item = materializeTask(fresh.id);
      if (item) {
        mergedTasks.push(item);
        seenIds.add(fresh.id);
      }
    }
  } else {
    for (const fresh of snapshot.tasks) {
      const item = materializeTask(fresh.id);
      if (item) {
        mergedTasks.push(item);
        seenIds.add(fresh.id);
      }
    }
    for (const [todoId, op] of latest) {
      if (seenIds.has(todoId) || op.completed || mergedTasks.length >= maxRows) continue;
      const item = materializeTask(todoId);
      if (item) {
        mergedTasks.push(item);
        seenIds.add(todoId);
      }
    }
  }

  const lastTapAt =
    typeof prevSnap?.lastTapAt === "number" && prevSnap.lastTapAt > 0
      ? prevSnap.lastTapAt
      : undefined;

  return {
    ...snapshot,
    ...(lastTapAt !== undefined ? { lastTapAt } : {}),
    tasks: mergedTasks,
    doneCount: Math.min(Math.max(0, doneCount), snapshot.totalCount),
    pendingOps: [...pendingOps],
  };
}

function isRecurringWidgetTask(task: WidgetTaskItem): boolean {
  return Boolean(task.recurrence && task.recurrence !== "none");
}

/**
 * Applies successfully replayed widget checkoffs to a cached todo list so the
 * app (and the next widget rebuild) shows the same state the server now has.
 * Uses the server's returned todo when available (recurring tasks come back
 * rescheduled), otherwise applies the done state locally. Subtasks nested under
 * a parent are patched too.
 */
export function applyReplayedWidgetOpsToTodos<T extends TodoItem>(
  todos: T[] | undefined,
  outcomes: WidgetReplayOutcome[]
): T[] | undefined {
  if (!todos) return todos;
  const applied = outcomes.filter(
    (o): o is Extract<WidgetReplayOutcome, { status: "applied" }> => o.status === "applied"
  );
  if (!applied.length) return todos;

  const patch = (item: T): T => {
    const outcome = applied.find((o) => o.op.todoId === item.id);
    if (!outcome) return item;
    if (outcome.todo) {
      return { ...item, ...outcome.todo, subtasks: item.subtasks } as T;
    }
    return applySetCompletedLocal(item, outcome.op.completed).todo;
  };

  return todos.map((t) => {
    const next = patch(t);
    if (next.subtasks?.length) {
      return { ...next, subtasks: next.subtasks.map((s) => patch(s as T)) } as T;
    }
    return next;
  });
}
