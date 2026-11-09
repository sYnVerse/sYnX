import { describe, it, expect } from "vitest";
import {
  buildListWidgetSnapshot,
  buildUpNextWidgetSnapshot,
  buildProgressWidgetSnapshot,
  extractPendingWidgetOps,
  reconcileWidgetPendingOps,
  applyWidgetTaskCompletion,
  toNativeWidgetProps,
  type WidgetTaskItem,
} from "../shared/widget-snapshot";
import type { TodoItem, TodoList } from "../shared";
import { DEFAULT_TASK_SORT_MODE, sortTasks, type TaskSortMode } from "../shared/task-sort";

describe("Widget Snapshot & Replay Pure Functions", () => {
  const mockList: TodoList = {
    id: "list-1",
    name: "Work Sprint",
    category: "Work",
    ownerId: "user-1",
    createdAt: 1000,
    shareMode: "public_edit",
    isOwner: true,
    canEdit: true,
  };

  const now = 1700000000000;

  const mockTodos: TodoItem[] = [
    {
      id: "task-1",
      listId: "list-1",
      text: "Normal task",
      completed: false,
      priority: "none",
      recurrence: "none",
      reminderSent: false,
      createdAt: 1000,
    },
    {
      id: "task-2",
      listId: "list-1",
      text: "Urgent task",
      completed: false,
      priority: "high",
      reminderAt: now + 3600000, // 1 hour in future
      recurrence: "none",
      reminderSent: false,
      createdAt: 2000,
    },
    {
      id: "task-3",
      listId: "list-1",
      text: "Completed task",
      completed: true,
      priority: "medium",
      recurrence: "none",
      reminderSent: false,
      createdAt: 3000,
    },
    {
      id: "sub-1",
      listId: "list-1",
      text: "Subtask 1",
      parentId: "task-1",
      completed: true,
      priority: "none",
      recurrence: "none",
      reminderSent: false,
      createdAt: 4000,
    },
    {
      id: "sub-2",
      listId: "list-1",
      text: "Subtask 2",
      parentId: "task-1",
      completed: false,
      priority: "none",
      recurrence: "none",
      reminderSent: false,
      createdAt: 5000,
    },
  ];

  describe("buildListWidgetSnapshot", () => {
    it("returns logged-out snapshot when listMeta is null", () => {
      const snap = buildListWidgetSnapshot(null, null, { now });
      expect(snap.isLoggedIn).toBe(false);
      expect(snap.listTitle).toBe("sYnX");
      expect(snap.tasks).toHaveLength(0);
    });

    it("correctly builds active list snapshot with priority sorting and subtask counts", () => {
      const snap = buildListWidgetSnapshot(mockList, mockTodos, { now });
      expect(snap.isLoggedIn).toBe(true);
      expect(snap.listTitle).toBe("Work Sprint");
      expect(snap.categoryEmoji).toBe("💼");
      expect(snap.ownershipLabel).toBe("Yours");
      expect(snap.canEdit).toBe(true);

      // Total count includes parent tasks + subtasks (5 total, 2 completed)
      expect(snap.totalCount).toBe(5);
      expect(snap.doneCount).toBe(2);

      // Open top-level tasks: task-2 (high) then task-1 (none). Subtasks are excluded from top-level list
      expect(snap.tasks).toHaveLength(2);
      expect(snap.tasks[0].id).toBe("task-2");
      expect(snap.tasks[0].priority).toBe("high");
      expect(snap.tasks[0].isOverdue).toBe(false);
      expect(snap.tasks[0].reminderLabel).toMatch(/^Today, \d{1,2}:\d{2}/);

      expect(snap.tasks[1].id).toBe("task-1");
      expect(snap.tasks[1].reminderLabel).toBeUndefined();
      expect(snap.tasks[1].subtaskProgress).toBe("1/2");
    });

    it("identifies overdue tasks", () => {
      const overdueTask: TodoItem = {
        id: "overdue-1",
        listId: "list-1",
        text: "Overdue task",
        completed: false,
        priority: "medium",
        reminderAt: now - 3600000, // 1 hour ago
        recurrence: "none",
        reminderSent: true,
        createdAt: 500,
      };
      const snap = buildListWidgetSnapshot(mockList, [overdueTask], { now });
      expect(snap.tasks[0].isOverdue).toBe(true);
      expect(snap.tasks[0].reminderLabel).toMatch(/^Today, \d{1,2}:\d{2}/);
    });

    it("formats reminderLabel with date and time across relative and calendar days", () => {
      const baseDate = new Date(now);
      const makeDate = (dOffset: number, hour: number, min: number, yearOffset: number = 0) =>
        new Date(
          baseDate.getFullYear() + yearOffset,
          baseDate.getMonth(),
          baseDate.getDate() + dOffset,
          hour,
          min
        ).getTime();

      const items: TodoItem[] = [
        {
          id: "t-today",
          listId: "list-1",
          text: "Today task",
          completed: false,
          priority: "none",
          recurrence: "none",
          reminderAt: makeDate(0, 14, 30),
          reminderSent: false,
          createdAt: 100,
        },
        {
          id: "t-tomorrow",
          listId: "list-1",
          text: "Tomorrow task",
          completed: false,
          priority: "none",
          recurrence: "none",
          reminderAt: makeDate(1, 9, 0),
          reminderSent: false,
          createdAt: 200,
        },
        {
          id: "t-yesterday",
          listId: "list-1",
          text: "Yesterday task",
          completed: false,
          priority: "none",
          recurrence: "none",
          reminderAt: makeDate(-1, 16, 0),
          reminderSent: true,
          createdAt: 300,
        },
        {
          id: "t-future",
          listId: "list-1",
          text: "Future task",
          completed: false,
          priority: "none",
          recurrence: "none",
          reminderAt: makeDate(5, 11, 15),
          reminderSent: false,
          createdAt: 400,
        },
        {
          id: "t-overdue-calendar",
          listId: "list-1",
          text: "Past calendar task",
          completed: false,
          priority: "none",
          recurrence: "none",
          reminderAt: makeDate(-4, 10, 0),
          reminderSent: true,
          createdAt: 500,
        },
        {
          id: "t-next-year",
          listId: "list-1",
          text: "Next year task",
          completed: false,
          priority: "none",
          recurrence: "none",
          reminderAt: makeDate(0, 12, 0, 1),
          reminderSent: false,
          createdAt: 600,
        },
      ];

      const snap = buildListWidgetSnapshot(mockList, items, { now, locale: "en-US", sortMode: "created" });
      const byId = Object.fromEntries(snap.tasks.map((t) => [t.id, t]));

      expect(byId["t-today"].reminderLabel).toMatch(/^Today, \d{1,2}:\d{2}\s?(AM|PM)?$/i);
      expect(byId["t-tomorrow"].reminderLabel).toMatch(/^Tomorrow, \d{1,2}:\d{2}\s?(AM|PM)?$/i);
      expect(byId["t-yesterday"].reminderLabel).toMatch(/^Yesterday, \d{1,2}:\d{2}\s?(AM|PM)?$/i);
      expect(byId["t-yesterday"].isOverdue).toBe(true);

      // Future task 5 days out: Nov <day>, <time>
      expect(byId["t-future"].reminderLabel).toMatch(/^[A-Z][a-z]{2}\s\d{1,2},\s\d{1,2}:\d{2}\s?(AM|PM)?$/i);
      expect(byId["t-future"].isOverdue).toBe(false);

      // Past calendar task 4 days ago: Nov <day>, <time>
      expect(byId["t-overdue-calendar"].reminderLabel).toMatch(/^[A-Z][a-z]{2}\s\d{1,2},\s\d{1,2}:\d{2}\s?(AM|PM)?$/i);
      expect(byId["t-overdue-calendar"].isOverdue).toBe(true);

      // Next year task: includes year
      expect(byId["t-next-year"].reminderLabel).toContain(String(baseDate.getFullYear() + 1));
    });
  });

  describe("buildUpNextWidgetSnapshot", () => {
    it("filters only tasks with reminders sorted chronologically and formats reminderLabel with date and time", () => {
      const snap = buildUpNextWidgetSnapshot(mockList, mockTodos, { now });
      expect(snap.categoryEmoji).toBe("⏰");
      expect(snap.tasks).toHaveLength(1);
      expect(snap.tasks[0].id).toBe("task-2");
      expect(snap.tasks[0].reminderLabel).toMatch(/^Today, \d{1,2}:\d{2}/);
    });
  });

  describe("buildProgressWidgetSnapshot", () => {
    it("computes progress percent and identifies next urgent task", () => {
      const snap = buildProgressWidgetSnapshot(mockList, mockTodos, { now });
      expect(snap.totalCount).toBe(5);
      expect(snap.doneCount).toBe(2);
      expect(snap.progressPercent).toBe(40); // 2/5 = 40%
      expect(snap.nextTaskText).toBe("Urgent task");
    });
  });

  describe("extractPendingWidgetOps & reconcileWidgetPendingOps", () => {
    it("safely extracts pendingOps from valid and invalid inputs", () => {
      expect(extractPendingWidgetOps(null)).toEqual([]);
      expect(extractPendingWidgetOps({})).toEqual([]);
      expect(extractPendingWidgetOps({ pendingOps: "invalid" })).toEqual([]);

      const validOps = [
        { todoId: "t1", listId: "l1", completed: true, at: 100 },
        { todoId: "t2", listId: "l1", completed: true, at: 200 },
      ];
      expect(extractPendingWidgetOps({ pendingOps: validOps })).toEqual(validOps);
    });

    it("reconciles and deduplicates pending ops preserving latest timestamp", () => {
      const ops = [
        { todoId: "t1", listId: "l1", completed: false, at: 100 },
        { todoId: "t2", listId: "l1", completed: true, at: 150 },
        { todoId: "t1", listId: "l1", completed: true, at: 200 },
      ];
      const reconciled = reconcileWidgetPendingOps(ops);
      expect(reconciled).toHaveLength(2);
      const t1 = reconciled.find((o) => o.todoId === "t1");
      expect(t1?.completed).toBe(true);
      expect(t1?.at).toBe(200);
    });
  });

  describe("applyWidgetTaskCompletion", () => {
    it("removes completed non-recurring task from open widget tasks", () => {
      const tasks: WidgetTaskItem[] = [
        { id: "t1", text: "Task 1", completed: false, priority: "none", recurrence: "none" },
        { id: "t2", text: "Task 2", completed: false, priority: "none", recurrence: "none" },
      ];
      const result = applyWidgetTaskCompletion(tasks, "t1");
      expect(result.completedTask?.id).toBe("t1");
      expect(result.updatedTasks).toHaveLength(1);
      expect(result.updatedTasks[0].id).toBe("t2");
    });

    it("reschedules recurring task and keeps in widget tasks with advanced reminder and updated reminderLabel", () => {
      const tasks: WidgetTaskItem[] = [
        {
          id: "t-daily",
          text: "Daily Standup",
          completed: false,
          priority: "high",
          recurrence: "daily",
          reminderAt: now,
          reminderLabel: "Today, 2:13 PM",
        },
      ];
      const result = applyWidgetTaskCompletion(tasks, "t-daily", now, "en-US");
      expect(result.completedTask?.id).toBe("t-daily");
      expect(result.updatedTasks).toHaveLength(1);
      expect(result.updatedTasks[0].reminderAt).toBe(now + 86400000);
      expect(result.updatedTasks[0].reminderLabel).toMatch(/^Tomorrow, \d{1,2}:\d{2}\s?(AM|PM)?$/i);
    });
  });
});

function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === "object") return Object.values(value).some(containsUndefined);
  return false;
}

describe("toNativeWidgetProps (Android bridge safety)", () => {
  const list: TodoList = {
    id: "list-1",
    name: "Groceries",
    isOwner: true,
    canEdit: true,
  } as TodoList;
  const todos = [
    { id: "t1", listId: "list-1", text: "Milk", completed: false, createdAt: 1 },
    { id: "t2", listId: "list-1", text: "Eggs", completed: true, createdAt: 2 },
  ] as TodoItem[];

  it("built snapshots contain undefined fields that the native bridge rejects", () => {
    expect(containsUndefined(buildListWidgetSnapshot(list, todos))).toBe(true);
  });

  it("removes every undefined value from list, up next, and progress snapshots", () => {
    for (const snap of [
      buildListWidgetSnapshot(list, todos),
      buildUpNextWidgetSnapshot(list, todos),
      buildProgressWidgetSnapshot(list, todos),
    ]) {
      const clean = toNativeWidgetProps(snap);
      expect(containsUndefined(clean)).toBe(false);
      expect(clean.isLoggedIn).toBe(true);
      expect(clean.listId).toBe("list-1");
    }
  });

  it("keeps defined values, drops undefined array items, and nulls non-finite numbers", () => {
    const clean = toNativeWidgetProps({
      a: 1,
      b: undefined,
      c: [{ x: undefined, y: "ok" }, undefined, false],
      d: { e: null, f: NaN, g: Infinity },
    } as Record<string, unknown>);
    expect(clean).toEqual({
      a: 1,
      c: [{ y: "ok" }, false],
      d: { e: null, f: null, g: null },
    });
  });
});

describe("list widget title", () => {
  it("drops a leading category emoji from the list name so the header doesn't repeat it", () => {
    const snap = buildListWidgetSnapshot(
      { id: "l1", name: "📋 Various", isOwner: true, canEdit: true } as TodoList,
      []
    );
    expect(snap.listTitle).toBe("Various");
    expect(`${snap.categoryEmoji} ${snap.listTitle}`).toBe("📋 Various");
  });

  it("keeps names without a leading emoji unchanged", () => {
    const snap = buildListWidgetSnapshot(
      { id: "l2", name: "Groceries", isOwner: true, canEdit: true } as TodoList,
      []
    );
    expect(snap.listTitle).toBe("Groceries");
  });
});

describe("widgets follow the list's task sort", () => {
  const list: TodoList = {
    id: "list-sort",
    name: "Errands",
    category: "Personal",
    ownerId: "user-1",
    createdAt: 1000,
    shareMode: "private",
    isOwner: true,
    canEdit: true,
  };
  const now = 1700000000000;

  function task(id: string, fields: Partial<TodoItem>): TodoItem {
    return {
      id,
      listId: "list-sort",
      text: id,
      completed: false,
      priority: "none",
      recurrence: "none",
      reminderSent: false,
      createdAt: 1000,
      ...fields,
    };
  }

  // a: oldest, high priority, no reminder
  // b: medium priority, reminder in 2 hours
  // c: newest, low priority, reminder in 1 hour
  // d: no priority, no reminder
  // e: completed (never shown)
  // s: open subtask of a (never a top-level row)
  const todos: TodoItem[] = [
    task("a", { text: "Buy milk", priority: "high", createdAt: 1000 }),
    task("b", { text: "Call bank", priority: "medium", reminderAt: now + 7200000, createdAt: 2000 }),
    task("c", { text: "Drop off package", priority: "low", reminderAt: now + 3600000, createdAt: 4000 }),
    task("d", { text: "apples", createdAt: 3000 }),
    task("e", { text: "Done already", priority: "high", completed: true, createdAt: 5000 }),
    task("s", { text: "Oat milk", parentId: "a", priority: "high", createdAt: 6000 }),
  ];

  const ids = (sortMode?: TaskSortMode) =>
    buildListWidgetSnapshot(list, todos, { now, sortMode }).tasks.map((t) => t.id);

  it("orders by Reminder Time: soonest reminder first, then the rest by priority", () => {
    expect(ids("reminder")).toEqual(["c", "b", "a", "d"]);
  });

  it("defaults to Reminder Time when no sort is passed", () => {
    expect(ids()).toEqual(ids("reminder"));
    expect(ids()).toEqual(ids(DEFAULT_TASK_SORT_MODE));
  });

  it("orders by Priority, high to low", () => {
    expect(ids("priority")).toEqual(["a", "b", "c", "d"]);
  });

  it("orders by Date Created, newest first", () => {
    expect(ids("created")).toEqual(["c", "d", "b", "a"]);
  });

  it("orders A to Z, ignoring case", () => {
    expect(ids("alphabetical")).toEqual(["d", "a", "b", "c"]);
  });

  it("matches the app's order for every sort", () => {
    const appOrder = (mode: TaskSortMode) =>
      sortTasks(todos.filter((t) => !t.parentId && !t.completed), mode).map((t) => t.id);
    for (const mode of ["created", "priority", "reminder", "alphabetical"] as const) {
      expect(ids(mode)).toEqual(appOrder(mode));
    }
  });

  it("breaks ties newest first", () => {
    const tied = [
      task("old", { text: "Same", priority: "high", createdAt: 1000 }),
      task("new", { text: "Same", priority: "high", createdAt: 2000 }),
    ];
    const snap = buildListWidgetSnapshot(list, tied, { now, sortMode: "priority" });
    expect(snap.tasks.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("keeps subtask counts on the right task after sorting", () => {
    const snap = buildListWidgetSnapshot(list, todos, { now, sortMode: "alphabetical" });
    expect(snap.tasks.find((t) => t.id === "a")?.subtaskProgress).toBe("0/1");
  });

  it("picks the progress widget's next task as the first open task in the list's sort", () => {
    const next = (sortMode?: TaskSortMode) =>
      buildProgressWidgetSnapshot(list, todos, { now, sortMode }).nextTaskText;
    expect(next("reminder")).toBe("Drop off package");
    expect(next()).toBe("Drop off package");
    expect(next("priority")).toBe("Buy milk");
    expect(next("created")).toBe("Drop off package");
    expect(next("alphabetical")).toBe("apples");
  });

  it("keeps the Up Next view earliest reminder first for every sort", () => {
    for (const sortMode of ["created", "priority", "reminder", "alphabetical"] as const) {
      const snap = buildUpNextWidgetSnapshot(list, todos, { now, sortMode });
      expect(snap.tasks.map((t) => t.id)).toEqual(["c", "b"]);
    }
  });
});
