import { describe, it, expect } from "vitest";
import { countTaskProgress } from "../shared";
import { countTaskProgress as mobileCountTaskProgress } from "../mobile/src/shared/task-progress";
import { buildProgressWidgetSnapshot } from "../shared/widget-snapshot";
import type { TodoItem, TodoList } from "../shared";

function todo(id: string, completed: boolean, parentId?: string): TodoItem {
  return {
    id,
    listId: "list-1",
    text: id,
    completed,
    createdAt: 1000,
    priority: "none",
    reminderSent: false,
    recurrence: "none",
    parentId: parentId ?? null,
  };
}

const list: TodoList = {
  id: "list-1",
  name: "Groceries",
  ownerId: "user-1",
  createdAt: 1000,
  shareMode: "private",
  canEdit: true,
};

describe("countTaskProgress", () => {
  it("counts subtasks as well as top-level tasks", () => {
    // One open parent with a done subtask, plus one done top-level task.
    const todos = [todo("a", false), todo("a1", true, "a"), todo("b", true)];
    expect(countTaskProgress(todos)).toEqual({ done: 2, total: 3, percent: 67 });
  });

  it("moves when only a subtask is checked off", () => {
    const before = [todo("a", false), todo("a1", false, "a")];
    const after = [todo("a", false), todo("a1", true, "a")];
    expect(countTaskProgress(before).percent).toBe(0);
    expect(countTaskProgress(after).percent).toBe(50);
  });

  it("treats an empty or missing list as 0%", () => {
    expect(countTaskProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(countTaskProgress(null)).toEqual({ done: 0, total: 0, percent: 0 });
    expect(countTaskProgress(undefined)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("rounds to a whole percent", () => {
    const of = (done: number, total: number) =>
      countTaskProgress(
        Array.from({ length: total }, (_, i) => ({ completed: i < done }))
      ).percent;
    expect(of(1, 3)).toBe(33);
    expect(of(2, 3)).toBe(67);
    expect(of(1, 8)).toBe(13); // 12.5 rounds up
    expect(of(1, 200)).toBe(1); // 0.5 rounds up
    expect(of(199, 200)).toBe(100); // 99.5 rounds up
    expect(of(3, 3)).toBe(100);
  });

  it("matches the mobile progress widget's numbers", () => {
    const todos = [
      todo("a", false),
      todo("a1", true, "a"),
      todo("a2", false, "a"),
      todo("b", true),
      todo("b1", true, "b"),
    ];
    const snap = buildProgressWidgetSnapshot(list, todos, { now: 0 });
    const progress = countTaskProgress(todos);
    expect(snap.doneCount).toBe(progress.done);
    expect(snap.totalCount).toBe(progress.total);
    expect(snap.progressPercent).toBe(progress.percent);
    expect(progress).toEqual({ done: 3, total: 5, percent: 60 });
  });

  it("ships the same helper in the mobile copy of shared", () => {
    const todos = [todo("a", true), todo("a1", false, "a"), todo("b", false)];
    expect(mobileCountTaskProgress(todos)).toEqual(countTaskProgress(todos));
  });
});
