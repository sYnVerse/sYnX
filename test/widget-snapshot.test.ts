import { describe, it, expect } from "vitest";
import {
  buildListWidgetSnapshot,
  buildUpNextWidgetSnapshot,
  buildProgressWidgetSnapshot,
  extractPendingWidgetOps,
  reconcileWidgetPendingOps,
  applyWidgetTaskCompletion,
  type WidgetTaskItem,
} from "../shared/widget-snapshot";
import type { TodoItem, TodoList } from "../shared";

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

      expect(snap.tasks[1].id).toBe("task-1");
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
    });
  });

  describe("buildUpNextWidgetSnapshot", () => {
    it("filters only tasks with reminders sorted chronologically", () => {
      const snap = buildUpNextWidgetSnapshot(mockList, mockTodos, { now });
      expect(snap.categoryEmoji).toBe("⏰");
      expect(snap.tasks).toHaveLength(1);
      expect(snap.tasks[0].id).toBe("task-2");
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

    it("reschedules recurring task and keeps in widget tasks with advanced reminder", () => {
      const tasks: WidgetTaskItem[] = [
        {
          id: "t-daily",
          text: "Daily Standup",
          completed: false,
          priority: "high",
          recurrence: "daily",
          reminderAt: now,
        },
      ];
      const result = applyWidgetTaskCompletion(tasks, "t-daily");
      expect(result.completedTask?.id).toBe("t-daily");
      expect(result.updatedTasks).toHaveLength(1);
      expect(result.updatedTasks[0].reminderAt).toBe(now + 86400000);
    });
  });
});
