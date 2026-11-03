import { describe, expect, it } from "vitest";
import { sortSubtasks, sortTasks, splitCompletedTasks, type PriorityLevel } from "../shared";

interface T {
  id: string;
  text: string;
  completed: boolean;
  priority: PriorityLevel;
  createdAt: number;
  reminderAt?: number | null;
  subtasks?: T[];
}

let clock = 0;
/** Each new task is created 1s after the previous one unless createdAt is given. */
function task(id: string, opts: Partial<Omit<T, "id">> = {}): T {
  clock += 1000;
  return { id, text: id, completed: false, priority: "none", createdAt: clock, ...opts };
}

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe("splitCompletedTasks", () => {
  it("puts completed tasks in their own group and keeps the given order in both", () => {
    const tasks = [
      task("a"),
      task("b", { completed: true }),
      task("c"),
      task("d", { completed: true }),
      task("e"),
    ];
    const { active, completed } = splitCompletedTasks(tasks);
    expect(ids(active)).toEqual(["a", "c", "e"]);
    expect(ids(completed)).toEqual(["b", "d"]);
  });

  it("returns empty groups for an empty list", () => {
    expect(splitCompletedTasks([])).toEqual({ active: [], completed: [] });
  });

  it("handles lists where everything or nothing is completed", () => {
    const open = [task("a"), task("b")];
    const done = [task("c", { completed: true }), task("d", { completed: true })];
    expect(ids(splitCompletedTasks(open).active)).toEqual(["a", "b"]);
    expect(splitCompletedTasks(open).completed).toEqual([]);
    expect(splitCompletedTasks(done).active).toEqual([]);
    expect(ids(splitCompletedTasks(done).completed)).toEqual(["c", "d"]);
  });

  it("does not change the input", () => {
    const tasks = [task("a", { completed: true }), task("b")];
    const before = ids(tasks);
    const result = splitCompletedTasks(tasks);
    expect(ids(tasks)).toEqual(before);
    expect(result.active).not.toBe(tasks);
    expect(result.completed).not.toBe(tasks);
  });

  it("moves a completed parent with all its subtasks, even open ones", () => {
    const parent = task("parent", {
      completed: true,
      subtasks: [task("s1"), task("s2", { completed: true })],
    });
    const { active, completed } = splitCompletedTasks([task("other"), parent]);
    expect(ids(active)).toEqual(["other"]);
    expect(completed).toHaveLength(1);
    expect(ids(completed[0].subtasks ?? [])).toEqual(["s1", "s2"]);
  });

  it("keeps an open parent active even when all its subtasks are done", () => {
    const parent = task("parent", { subtasks: [task("s1", { completed: true })] });
    const { active, completed } = splitCompletedTasks([parent]);
    expect(ids(active)).toEqual(["parent"]);
    expect(completed).toEqual([]);
  });

  it("keeps the list's sort inside both groups when sorted first", () => {
    const tasks = [
      task("low-open", { priority: "low" }),
      task("high-done", { priority: "high", completed: true }),
      task("high-open", { priority: "high" }),
      task("low-done", { priority: "low", completed: true }),
      task("med-done", { priority: "medium", completed: true }),
    ];
    const { active, completed } = splitCompletedTasks(sortTasks(tasks, "priority"));
    expect(ids(active)).toEqual(["high-open", "low-open"]);
    expect(ids(completed)).toEqual(["high-done", "med-done", "low-done"]);
  });

  it("keeps subtasks oldest first in both groups after sortSubtasks", () => {
    const s1 = task("s1", { createdAt: 1, completed: true });
    const s2 = task("s2", { createdAt: 2 });
    const s3 = task("s3", { createdAt: 3, completed: true });
    const s4 = task("s4", { createdAt: 4 });
    const { active, completed } = splitCompletedTasks(sortSubtasks([s4, s3, s2, s1]));
    expect(ids(active)).toEqual(["s2", "s4"]);
    expect(ids(completed)).toEqual(["s1", "s3"]);
  });
});
