import { TodoItem, TodoList } from "./index";
import { formatReminderTime, listOwnershipLabel } from "./mobile-ux";
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
    listTitle: listMeta.name,
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
