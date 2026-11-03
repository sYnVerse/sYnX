import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_SORT_MODE,
  TASK_SORT_OPTIONS,
  isTaskSortMode,
  resolveTaskSortMode,
  sortSubtasks,
  sortTasks,
  taskSortStorageKey,
  type PriorityLevel,
} from "../shared";

interface T {
  id: string;
  text: string;
  priority: PriorityLevel;
  createdAt: number;
  reminderAt?: number | null;
  subtasks?: T[];
}

let clock = 0;
/** Each new task is created 1s after the previous one unless createdAt is given. */
function task(id: string, opts: Partial<Omit<T, "id">> = {}): T {
  clock += 1000;
  return { id, text: id, priority: "none", createdAt: clock, ...opts };
}

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe("task sort options", () => {
  it("offers the same four options on web and mobile, with Reminder Time as the default", () => {
    expect(TASK_SORT_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ["created", "Date Created"],
      ["priority", "Priority"],
      ["reminder", "Reminder Time"],
      ["alphabetical", "Alphabetical"],
    ]);
    expect(DEFAULT_TASK_SORT_MODE).toBe("reminder");
  });
});

describe("sortTasks: Date Created", () => {
  it("puts the newest first", () => {
    const tasks = [
      task("old", { createdAt: 1000 }),
      task("new", { createdAt: 3000 }),
      task("mid", { createdAt: 2000, priority: "high", reminderAt: 1 }),
    ];
    expect(ids(sortTasks(tasks, "created"))).toEqual(["new", "mid", "old"]);
  });
});

describe("sortTasks: Reminder Time (default)", () => {
  it("puts tasks with a reminder first, soonest first", () => {
    const tasks = [
      task("late", { reminderAt: 3000 }),
      task("none"),
      task("soon", { reminderAt: 1000 }),
      task("mid", { reminderAt: 2000 }),
    ];
    expect(ids(sortTasks(tasks, "reminder"))).toEqual(["soon", "mid", "late", "none"]);
  });

  it("orders tasks with no reminder by priority, high to none, after the reminders", () => {
    const tasks = [
      task("low", { priority: "low" }),
      task("none", { priority: "none" }),
      task("high", { priority: "high" }),
      task("remind", { reminderAt: 5000, priority: "low" }),
      task("medium", { priority: "medium" }),
      task("nullReminder", { priority: "high", reminderAt: null }),
    ];
    expect(ids(sortTasks(tasks, "reminder"))).toEqual([
      "remind",
      "nullReminder",
      "high",
      "medium",
      "low",
      "none",
    ]);
  });

  it("does not let priority outrank a reminder", () => {
    const tasks = [task("high", { priority: "high" }), task("remind", { reminderAt: 1, priority: "none" })];
    expect(ids(sortTasks(tasks, "reminder"))).toEqual(["remind", "high"]);
  });

  it("breaks ties newest first", () => {
    const tasks = [
      task("r-old", { reminderAt: 1000 }),
      task("r-new", { reminderAt: 1000 }),
      task("h-old", { priority: "high" }),
      task("h-new", { priority: "high" }),
    ];
    expect(ids(sortTasks(tasks, "reminder"))).toEqual(["r-new", "r-old", "h-new", "h-old"]);
  });

  it("keeps the incoming order when everything ties", () => {
    const tasks = [task("a", { createdAt: 5 }), task("b", { createdAt: 5 }), task("c", { createdAt: 5 })];
    expect(ids(sortTasks(tasks, "reminder"))).toEqual(["a", "b", "c"]);
  });
});

describe("sortTasks: Priority", () => {
  it("sorts high to low and ignores reminders", () => {
    const tasks = [
      task("none", { reminderAt: 1 }),
      task("low", { priority: "low" }),
      task("high", { priority: "high" }),
      task("medium", { priority: "medium" }),
    ];
    expect(ids(sortTasks(tasks, "priority"))).toEqual(["high", "medium", "low", "none"]);
  });

  it("breaks ties newest first", () => {
    const tasks = [
      task("h-old", { priority: "high" }),
      task("l-old", { priority: "low" }),
      task("h-new", { priority: "high" }),
      task("l-new", { priority: "low" }),
    ];
    expect(ids(sortTasks(tasks, "priority"))).toEqual(["h-new", "h-old", "l-new", "l-old"]);
  });
});

describe("sortTasks: Alphabetical", () => {
  it("sorts A to Z ignoring case", () => {
    const tasks = [task("1", { text: "banana" }), task("2", { text: "Apple" }), task("3", { text: "cherry" })];
    expect(sortTasks(tasks, "alphabetical").map((t) => t.text)).toEqual(["Apple", "banana", "cherry"]);
  });

  it("treats the same text in different case as a tie, newest first", () => {
    const tasks = [task("older", { text: "Milk" }), task("newer", { text: "milk" })];
    expect(ids(sortTasks(tasks, "alphabetical"))).toEqual(["newer", "older"]);
  });
});

describe("subtasks", () => {
  it("stay under their parent, oldest first, whatever the sort", () => {
    const subs = [
      task("s-new", { text: "a", priority: "high", reminderAt: 1, createdAt: 300 }),
      task("s-old", { text: "z", priority: "none", createdAt: 100 }),
      task("s-mid", { text: "m", priority: "low", createdAt: 200 }),
    ];
    const tasks = [task("b-parent", { text: "B", subtasks: subs }), task("a-parent", { text: "A" })];
    for (const mode of ["created", "priority", "reminder", "alphabetical"] as const) {
      const sorted = sortTasks(tasks, mode);
      const parent = sorted.find((t) => t.id === "b-parent");
      expect(ids(parent?.subtasks ?? [])).toEqual(["s-old", "s-mid", "s-new"]);
    }
    expect(ids(sortTasks(tasks, "alphabetical"))).toEqual(["a-parent", "b-parent"]);
  });

  it("sortSubtasks orders oldest first and keeps the incoming order for ties", () => {
    const subs = [task("b", { createdAt: 20 }), task("a", { createdAt: 10 }), task("c", { createdAt: 20 })];
    expect(ids(sortSubtasks(subs))).toEqual(["a", "b", "c"]);
  });

  it("does not change the input arrays", () => {
    const subtasks = [task("s2", { createdAt: 20 }), task("s1", { createdAt: 10 })];
    const tasks = [task("b", { text: "b", subtasks }), task("a", { text: "a" })];
    sortTasks(tasks, "alphabetical");
    expect(ids(tasks)).toEqual(["b", "a"]);
    expect(ids(subtasks)).toEqual(["s2", "s1"]);
  });
});

describe("resolveTaskSortMode", () => {
  it("uses the list's choice when it is one of the four sorts", () => {
    expect(resolveTaskSortMode("reminder", "alphabetical")).toBe("alphabetical");
    expect(resolveTaskSortMode("reminder", "created")).toBe("created");
  });

  it("falls back for App default, nothing saved, or an unknown value", () => {
    expect(resolveTaskSortMode("priority", "app_default")).toBe("priority");
    expect(resolveTaskSortMode("priority", null)).toBe("priority");
    expect(resolveTaskSortMode("priority", undefined)).toBe("priority");
    expect(resolveTaskSortMode("reminder", "due_time")).toBe("reminder");
  });

  it("recognizes only the four sorts", () => {
    expect(["created", "priority", "reminder", "alphabetical"].every(isTaskSortMode)).toBe(true);
    expect(isTaskSortMode("app_default")).toBe(false);
    expect(isTaskSortMode(undefined)).toBe(false);
  });

  it("uses one localStorage key per list on web", () => {
    expect(taskSortStorageKey("abc")).toBe("synx_task_sort:abc");
  });
});
