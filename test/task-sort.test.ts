import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_SORT_MODE,
  TASK_SORT_OPTIONS,
  applyOptimisticReorder,
  areTasksTiedInSortMode,
  canMoveTaskInDirection,
  hasTiedNeighborInSortMode,
  isTaskSortMode,
  resolveTaskSortMode,
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
  sortOrder?: number | null;
  parentId?: string | null;
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
  it("offers the same five options on web and mobile, with Reminder Time as the default", () => {
    expect(TASK_SORT_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ["created", "Date Created"],
      ["priority", "Priority"],
      ["reminder", "Reminder Time"],
      ["alphabetical", "Alphabetical"],
      ["manual", "Manual"],
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
  const subs = () => [
    task("s-old", { text: "z", priority: "none", createdAt: 100, sortOrder: 1 }),
    task("s-mid", { text: "m", priority: "low", reminderAt: 5000, createdAt: 200, sortOrder: 2 }),
    task("s-new", { text: "a", priority: "high", createdAt: 300, sortOrder: 0 }),
  ];

  it("stay under their parent and follow the list's sort", () => {
    const tasks = [task("b-parent", { text: "B", subtasks: subs() }), task("a-parent", { text: "A" })];
    const subIds = (mode: "created" | "priority" | "reminder" | "alphabetical" | "manual") =>
      ids(sortTasks(tasks, mode).find((t) => t.id === "b-parent")?.subtasks ?? []);

    expect(subIds("created")).toEqual(["s-new", "s-mid", "s-old"]);
    expect(subIds("priority")).toEqual(["s-new", "s-mid", "s-old"]);
    expect(subIds("reminder")).toEqual(["s-mid", "s-new", "s-old"]);
    expect(subIds("alphabetical")).toEqual(["s-new", "s-mid", "s-old"]);
    expect(subIds("manual")).toEqual(["s-new", "s-old", "s-mid"]);
    expect(ids(sortTasks(tasks, "alphabetical"))).toEqual(["a-parent", "b-parent"]);
  });

  it("sorts a bare subtask list the same way as top-level tasks", () => {
    expect(ids(sortTasks(subs(), "reminder"))).toEqual(["s-mid", "s-new", "s-old"]);
    expect(ids(sortTasks(subs(), "alphabetical"))).toEqual(["s-new", "s-mid", "s-old"]);
  });

  it("does not change the input arrays", () => {
    const subtasks = [task("s1", { text: "a", createdAt: 10 }), task("s2", { text: "b", createdAt: 20 })];
    const tasks = [task("b", { text: "b", subtasks }), task("a", { text: "a" })];
    const sorted = sortTasks(tasks, "created");
    expect(ids(tasks)).toEqual(["b", "a"]);
    expect(ids(subtasks)).toEqual(["s1", "s2"]);
    expect(ids(sorted.find((t) => t.id === "b")?.subtasks ?? [])).toEqual(["s2", "s1"]);
  });
});

describe("resolveTaskSortMode", () => {
  it("uses the list's choice when it is one of the five sorts", () => {
    expect(resolveTaskSortMode("reminder", "alphabetical")).toBe("alphabetical");
    expect(resolveTaskSortMode("reminder", "created")).toBe("created");
    expect(resolveTaskSortMode("reminder", "manual")).toBe("manual");
  });

  it("falls back for App default, nothing saved, or an unknown value", () => {
    expect(resolveTaskSortMode("priority", "app_default")).toBe("priority");
    expect(resolveTaskSortMode("priority", null)).toBe("priority");
    expect(resolveTaskSortMode("priority", undefined)).toBe("priority");
    expect(resolveTaskSortMode("reminder", "due_time")).toBe("reminder");
  });

  it("recognizes only the five sorts", () => {
    expect(["created", "priority", "reminder", "alphabetical", "manual"].every(isTaskSortMode)).toBe(true);
    expect(isTaskSortMode("app_default")).toBe(false);
    expect(isTaskSortMode(undefined)).toBe(false);
  });

  it("uses one localStorage key per list on web", () => {
    expect(taskSortStorageKey("abc")).toBe("synx_task_sort:abc");
  });
});

describe("custom sortOrder, tie-breaking, and reorder helpers (#212)", () => {
  it("sortTasks('manual') orders by sortOrder ascending with nulls last and createdAt DESC fallback", () => {
    const tasks = [
      task("null-old", { createdAt: 100, sortOrder: null }),
      task("ord-2", { createdAt: 500, priority: "high", sortOrder: 2 }),
      task("ord-0", { createdAt: 10, priority: "none", sortOrder: 0 }),
      task("null-new", { createdAt: 900, sortOrder: undefined }),
      task("ord-1", { createdAt: 200, sortOrder: 1 }),
    ];
    expect(ids(sortTasks(tasks, "manual"))).toEqual([
      "ord-0",
      "ord-1",
      "ord-2",
      "null-new",
      "null-old",
    ]);
  });

  it("breaks primary ties with sortOrder across priority, reminder, alphabetical, and equal-timestamp created", () => {
    expect(
      ids(
        sortTasks(
          [
            task("p1", { priority: "high", createdAt: 200, sortOrder: 1 }),
            task("p0", { priority: "high", createdAt: 100, sortOrder: 0 }),
            task("low", { priority: "low", createdAt: 999, sortOrder: 0 }),
          ],
          "priority"
        )
      )
    ).toEqual(["p0", "p1", "low"]);

    expect(
      ids(
        sortTasks(
          [
            task("r1", { reminderAt: 5000, createdAt: 200, sortOrder: 2 }),
            task("r0", { reminderAt: 5000, createdAt: 100, sortOrder: 1 }),
            task("later", { reminderAt: 9000, sortOrder: 0 }),
          ],
          "reminder"
        )
      )
    ).toEqual(["r0", "r1", "later"]);

    expect(
      ids(
        sortTasks(
          [
            task("a1", { text: "Milk", createdAt: 300, sortOrder: 5 }),
            task("a0", { text: "milk", createdAt: 100, sortOrder: 2 }),
          ],
          "alphabetical"
        )
      )
    ).toEqual(["a0", "a1"]);

    // Date Created still primarily orders by createdAt DESC when timestamps differ
    expect(
      ids(
        sortTasks(
          [
            task("older-ord0", { createdAt: 1000, sortOrder: 0 }),
            task("newer-ord2", { createdAt: 2000, sortOrder: 2 }),
            task("tie-b", { createdAt: 1500, sortOrder: 1 }),
            task("tie-a", { createdAt: 1500, sortOrder: 0 }),
          ],
          "created"
        )
      )
    ).toEqual(["newer-ord2", "tie-a", "tie-b", "older-ord0"]);
  });

  it("checks tied neighbors and directional moves accurately", () => {
    const ordered = [
      task("h1", { priority: "high", sortOrder: 0 }),
      task("h2", { priority: "high", sortOrder: 1 }),
      task("m1", { priority: "medium", sortOrder: 2 }),
    ];
    expect(areTasksTiedInSortMode("priority", ordered[0], ordered[1])).toBe(true);
    expect(areTasksTiedInSortMode("priority", ordered[1], ordered[2])).toBe(false);
    expect(areTasksTiedInSortMode("manual", ordered[1], ordered[2])).toBe(true);

    expect(canMoveTaskInDirection(ordered, "h1", "up", "priority")).toEqual({
      canMove: false,
      swapWithId: null,
      orderedIds: null,
    });
    expect(canMoveTaskInDirection(ordered, "h1", "down", "priority")).toEqual({
      canMove: true,
      swapWithId: "h2",
      orderedIds: ["h2", "h1", "m1"],
    });
    expect(canMoveTaskInDirection(ordered, "h2", "down", "priority").canMove).toBe(false);
    expect(canMoveTaskInDirection(ordered, "h2", "down", "manual")).toEqual({
      canMove: true,
      swapWithId: "m1",
      orderedIds: ["h1", "m1", "h2"],
    });

    expect(hasTiedNeighborInSortMode(ordered, "m1", "priority")).toBe(false);
    expect(hasTiedNeighborInSortMode(ordered, "m1", "manual")).toBe(true);
  });

  it("applyOptimisticReorder preserves untargeted sibling slots and scopes to parentId", () => {
    const todos = [
      { id: "a", parentId: null, sortOrder: 0, createdAt: 10 },
      { id: "b", parentId: null, sortOrder: 1, createdAt: 20 },
      { id: "c", parentId: null, sortOrder: 2, createdAt: 30 },
      { id: "d", parentId: null, sortOrder: 3, createdAt: 40 },
      { id: "sub-1", parentId: "a", sortOrder: 0, createdAt: 50 },
      { id: "sub-2", parentId: "a", sortOrder: 1, createdAt: 60 },
    ];

    // Subset reorder of b and c swaps their slots without moving a (0) or d (3) or subtasks
    const reorderedSubset = applyOptimisticReorder(todos, ["c", "b"], null)!;
    expect(
      reorderedSubset.filter((t) => !t.parentId).map((t) => [t.id, t.sortOrder])
    ).toEqual([
      ["a", 0],
      ["b", 2],
      ["c", 1],
      ["d", 3],
      ]);
    expect(
      reorderedSubset.filter((t) => t.parentId === "a").map((t) => [t.id, t.sortOrder])
    ).toEqual([
      ["sub-1", 0],
      ["sub-2", 1],
    ]);

    const reorderedSubs = applyOptimisticReorder(todos, ["sub-2", "sub-1"], "a")!;
    expect(
      reorderedSubs.filter((t) => t.parentId === "a").map((t) => [t.id, t.sortOrder])
    ).toEqual([
      ["sub-1", 1],
      ["sub-2", 0],
    ]);
  });
});
