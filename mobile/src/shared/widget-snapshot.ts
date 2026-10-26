import { TodoItem, TodoList } from "./index";
import { formatReminderTime, listOwnershipLabel, stripLeadingCategoryEmoji } from "./mobile-ux";
import { applySetCompletedLocal } from "./todo-completed";

export interface WidgetTaskItem {
  id: string;
  text: string;
  completed: boolean;
  priority: "high" | "medium" | "low" | "none";
  recurrence: "none" | "daily" | "weekly" | "monthly";
  reminderAt?: number;
  reminderLabel?: string;
  isOverdue?: boolean;
  subtaskProgress?: string;
}

export interface WidgetPendingOp {
  todoId: string;
  listId: string;
  completed: boolean;
  at: number;
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

const CATEGORY_EMOJIS: Record<string, string> = {
  Checklist: "📋",
  Study: "🎓",
  Shopping: "🛒",
  Movies: "🎬",
  Work: "💼",
  Personal: "🏠",
  Travel: "✈️",
  Fitness: "💪",
  Custom: "✏️",
};

export function getCategoryEmoji(category?: string | null): string {
  if (!category) return "📋";
  return CATEGORY_EMOJIS[category] || "📋";
}

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export interface BuildSnapshotOptions {
  maxTasks?: number;
  now?: number;
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

  const openTopLevel = topLevelTasks.filter((t) => !t.completed);

  openTopLevel.sort((a, b) => {
    const pA = PRIORITY_ORDER[a.priority] ?? 3;
    const pB = PRIORITY_ORDER[b.priority] ?? 3;
    if (pA !== pB) return pA - pB;

    if (a.reminderAt && b.reminderAt) {
      return a.reminderAt - b.reminderAt;
    }
    if (a.reminderAt) return -1;
    if (b.reminderAt) return 1;

    return b.createdAt - a.createdAt;
  });

  const widgetTasks: WidgetTaskItem[] = openTopLevel.slice(0, maxTasks).map((t) => {
    const subtasks = subtasksByParent[t.id] || [];
    const doneSub = subtasks.filter((s) => s.completed).length;
    const subtaskProgress = subtasks.length > 0 ? `${doneSub}/${subtasks.length}` : undefined;
    const isOverdue = Boolean(t.reminderAt && t.reminderAt < now);
    const reminderLabel = t.reminderAt ? formatReminderTime(t.reminderAt) : undefined;

    return {
      id: t.id,
      text: t.text,
      completed: false,
      priority: t.priority || "none",
      recurrence: t.recurrence || "none",
      reminderAt: t.reminderAt,
      reminderLabel,
      isOverdue,
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
        reminderLabel: t.reminderAt ? formatReminderTime(t.reminderAt) : undefined,
        isOverdue,
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
  options?: { now?: number }
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
  const totalCount = allTodos.length;
  const doneCount = allTodos.filter((t) => t.completed).length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Find next urgent uncompleted task
  const openTasks = allTodos.filter((t) => !t.completed && !t.parentId);
  openTasks.sort((a, b) => {
    const pA = PRIORITY_ORDER[a.priority] ?? 3;
    const pB = PRIORITY_ORDER[b.priority] ?? 3;
    if (pA !== pB) return pA - pB;
    if (a.reminderAt && b.reminderAt) return a.reminderAt - b.reminderAt;
    if (a.reminderAt) return -1;
    if (b.reminderAt) return 1;
    return b.createdAt - a.createdAt;
  });

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
export function extractPendingWidgetOps(rawProps: Record<string, any> | null | undefined): WidgetPendingOp[] {
  if (!rawProps || !Array.isArray(rawProps.pendingOps)) {
    return [];
  }
  const ops: WidgetPendingOp[] = [];
  for (const item of rawProps.pendingOps) {
    if (
      item &&
      typeof item.todoId === "string" &&
      typeof item.listId === "string" &&
      typeof item.completed === "boolean" &&
      typeof item.at === "number"
    ) {
      ops.push({
        todoId: item.todoId,
        listId: item.listId,
        completed: item.completed,
        at: item.at,
      });
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
  todoId: string
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
        reminderLabel: res.todo.reminderAt ? formatReminderTime(res.todo.reminderAt) : undefined,
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
  return a.todoId === b.todoId && a.listId === b.listId && a.completed === b.completed && a.at === b.at;
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

/**
 * Carries a widget's still-queued checkoffs into a freshly built snapshot.
 *
 * Rebuilding a widget from server or cache data must not erase taps that have
 * not reached the server yet. Every queued op is kept (including ops for a
 * different list, for example after the active list changed), and tasks with a
 * queued checkoff in this list stay hidden and counted as done, so the widget
 * doesn't flash the task back as open before the replay finishes.
 */
export function mergePendingOpsIntoSnapshot(
  snapshot: ListWidgetSnapshot,
  pendingOps: WidgetPendingOp[]
): ListWidgetSnapshot {
  if (!snapshot.isLoggedIn || !snapshot.listId) {
    return { ...snapshot, pendingOps: [] };
  }

  const latest = new Map<string, WidgetPendingOp>();
  for (const op of reconcileWidgetPendingOps(pendingOps)) {
    if (op.listId === snapshot.listId) latest.set(op.todoId, op);
  }

  let doneCount = snapshot.doneCount;
  const tasks = snapshot.tasks.filter((task) => {
    const op = latest.get(task.id);
    if (!op || !op.completed) return true;
    if (!isRecurringWidgetTask(task)) doneCount += 1;
    return false;
  });

  return {
    ...snapshot,
    tasks,
    doneCount: Math.min(doneCount, snapshot.totalCount),
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
