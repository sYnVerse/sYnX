import { describe, expect, it } from "vitest";
import type { PriorityLevel } from "../shared";
import {
  DEFAULT_TASK_SORT_MODE,
  isTaskSortMode,
  resolveTaskSortMode,
  sortTasks,
} from "../shared/task-sort";

interface T {
  id: string;
  text: string;
  priority: PriorityLevel;
  reminderAt?: number;
  subtasks?: T[];
}

function task(id: string, opts: Partial<Omit<T, "id">> = {}): T {
  return { id, text: opts.text ?? id, priority: opts.priority ?? "none", ...opts };
}

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe("sortTasks: due time (default)", () => {
  it("is the default sort", () => {
    expect(DEFAULT_TASK_SORT_MODE).toBe("due_time");
  });

  it("puts tasks with a reminder first, soonest first", () => {
    const tasks = [
      task("late", { reminderAt: 3000 }),
      task("none"),
      task("soon", { reminderAt: 1000 }),
      task("mid", { reminderAt: 2000 }),
    ];
    expect(ids(sortTasks(tasks, "due_time"))).toEqual(["soon", "mid", "late", "none"]);
  });

  it("orders tasks with no reminder by priority, high to low, after the reminders", () => {
    const tasks = [
      task("low", { priority: "low" }),
      task("none", { priority: "none" }),
      task("high", { priority: "high" }),
      task("remind", { reminderAt: 5000, priority: "low" }),
      task("medium", { priority: "medium" }),
    ];
    expect(ids(sortTasks(tasks, "due_time"))).toEqual(["remind", "high", "medium", "low", "none"]);
  });

  it("does not let priority outrank a reminder", () => {
    const tasks = [task("high", { priority: "high" }), task("remind", { reminderAt: 1, priority: "none" })];
    expect(ids(sortTasks(tasks, "due_time"))).toEqual(["remind", "high"]);
  });

  it("keeps the existing order for ties", () => {
    const tasks = [
      task("a", { reminderAt: 1000 }),
      task("b", { reminderAt: 1000 }),
      task("c", { priority: "high" }),
      task("d", { priority: "high" }),
      task("e"),
      task("f"),
    ];
    expect(ids(sortTasks(tasks, "due_time"))).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("sortTasks: priority", () => {
  it("sorts high to low and ignores reminders", () => {
    const tasks = [
      task("none", { reminderAt: 1 }),
      task("low", { priority: "low" }),
      task("high", { priority: "high" }),
      task("medium", { priority: "medium" }),
    ];
    expect(ids(sortTasks(tasks, "priority"))).toEqual(["high", "medium", "low", "none"]);
  });

  it("keeps the existing order for ties", () => {
    const tasks = [
      task("h1", { priority: "high" }),
      task("l1", { priority: "low" }),
      task("h2", { priority: "high" }),
      task("l2", { priority: "low" }),
    ];
    expect(ids(sortTasks(tasks, "priority"))).toEqual(["h1", "h2", "l1", "l2"]);
  });
});

describe("sortTasks: alphabetical", () => {
  it("sorts A to Z ignoring case", () => {
    const tasks = [task("1", { text: "banana" }), task("2", { text: "Apple" }), task("3", { text: "cherry" })];
    expect(sortTasks(tasks, "alphabetical").map((t) => t.text)).toEqual(["Apple", "banana", "cherry"]);
  });

  it("keeps the existing order for the same text in different case", () => {
    const tasks = [task("first", { text: "milk" }), task("second", { text: "Milk" })];
    expect(ids(sortTasks(tasks, "alphabetical"))).toEqual(["first", "second"]);
  });
});

describe("sortTasks: subtasks", () => {
  it("keeps subtasks under their parent and sorts them the same way", () => {
    const tasks = [
      task("z-parent", {
        text: "Zebra",
        subtasks: [task("s-c", { text: "c" }), task("s-a", { text: "a" }), task("s-b", { text: "B" })],
      }),
      task("a-parent", { text: "apple", subtasks: [task("s-y", { text: "y" }), task("s-x", { text: "x" })] }),
    ];
    const sorted = sortTasks(tasks, "alphabetical");
    expect(ids(sorted)).toEqual(["a-parent", "z-parent"]);
    expect(ids(sorted[0].subtasks!)).toEqual(["s-x", "s-y"]);
    expect(ids(sorted[1].subtasks!)).toEqual(["s-a", "s-b", "s-c"]);
  });

  it("sorts subtasks by due time with the priority fallback", () => {
    const tasks = [
      task("p", {
        subtasks: [
          task("s-low", { priority: "low" }),
          task("s-remind", { reminderAt: 10 }),
          task("s-high", { priority: "high" }),
        ],
      }),
    ];
    expect(ids(sortTasks(tasks, "due_time")[0].subtasks!)).toEqual(["s-remind", "s-high", "s-low"]);
  });

  it("does not change the input arrays", () => {
    const subtasks = [task("s2", { text: "b" }), task("s1", { text: "a" })];
    const tasks = [task("b", { text: "b", subtasks }), task("a", { text: "a" })];
    sortTasks(tasks, "alphabetical");
    expect(ids(tasks)).toEqual(["b", "a"]);
    expect(ids(subtasks)).toEqual(["s2", "s1"]);
  });
});

describe("resolveTaskSortMode", () => {
  it("uses the list override when set", () => {
    expect(resolveTaskSortMode("due_time", "alphabetical")).toBe("alphabetical");
  });

  it("falls back to the app-wide sort for App default or a missing or unknown value", () => {
    expect(resolveTaskSortMode("priority", "app_default")).toBe("priority");
    expect(resolveTaskSortMode("priority", null)).toBe("priority");
    expect(resolveTaskSortMode("priority", undefined)).toBe("priority");
    expect(resolveTaskSortMode("priority", "bogus" as never)).toBe("priority");
  });

  it("recognizes only the three sorts", () => {
    expect(["due_time", "priority", "alphabetical"].every(isTaskSortMode)).toBe(true);
    expect(isTaskSortMode("app_default")).toBe(false);
    expect(isTaskSortMode(undefined)).toBe(false);
  });
});
