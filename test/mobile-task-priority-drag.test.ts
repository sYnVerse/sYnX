import { describe, it, expect } from "vitest";
import {
  applyOptimisticTaskPriority,
  canDragTaskForPriority,
  PRIORITY_LEVELS_DESC,
  resolvePriorityFromVerticalOffset,
  sortTasks,
  type TodoItem,
} from "../shared";

function makeTask(overrides: Partial<TodoItem> & Pick<TodoItem, "id">): TodoItem {
  return {
    listId: "list-1",
    text: `Task ${overrides.id}`,
    completed: false,
    createdAt: 1_700_000_000_000,
    priority: "none",
    reminderSent: false,
    recurrence: "none",
    ...overrides,
  };
}

describe("mobile drag-and-drop task priority helpers (#109)", () => {
  it("allows dragging only editable, incomplete top-level tasks in priority sort", () => {
    const topLevel = makeTask({ id: "t-1", priority: "low" });
    expect(
      canDragTaskForPriority({ canEdit: true, sortMode: "priority", task: topLevel })
    ).toBe(true);

    // Subtasks cannot be dragged across parent priority buckets (#109 decision)
    const subtask = makeTask({ id: "sub-1", parentId: "t-1", priority: "low" });
    expect(
      canDragTaskForPriority({ canEdit: true, sortMode: "priority", task: subtask })
    ).toBe(false);

    // Completed, pending-delete, read-only, and non-priority sort modes disable drag
    expect(
      canDragTaskForPriority({
        canEdit: true,
        sortMode: "priority",
        task: { ...topLevel, completed: true },
      })
    ).toBe(false);
    expect(
      canDragTaskForPriority({
        canEdit: true,
        sortMode: "priority",
        task: { ...topLevel, pendingDelete: true },
      })
    ).toBe(false);
    expect(
      canDragTaskForPriority({ canEdit: false, sortMode: "priority", task: topLevel })
    ).toBe(false);
    expect(
      canDragTaskForPriority({ canEdit: true, sortMode: "reminder", task: topLevel })
    ).toBe(false);
    expect(
      canDragTaskForPriority({ canEdit: true, sortMode: "created", task: topLevel })
    ).toBe(false);
    expect(
      canDragTaskForPriority({ canEdit: true, sortMode: "alphabetical", task: topLevel })
    ).toBe(false);
  });

  it("maps vertical drag offsets to priority levels and clamps within High..None", () => {
    expect(PRIORITY_LEVELS_DESC).toEqual(["high", "medium", "low", "none"]);

    // Small movement stays at current priority
    expect(resolvePriorityFromVerticalOffset("low", -12)).toBe("low");
    expect(resolvePriorityFromVerticalOffset("low", 12)).toBe("low");

    // Dragging up increases priority (none -> low -> medium -> high)
    expect(resolvePriorityFromVerticalOffset("none", -44)).toBe("low");
    expect(resolvePriorityFromVerticalOffset("none", -88)).toBe("medium");
    expect(resolvePriorityFromVerticalOffset("none", -140)).toBe("high");
    // Clamps at High
    expect(resolvePriorityFromVerticalOffset("high", -200)).toBe("high");

    // Dragging down decreases priority (high -> medium -> low -> none)
    expect(resolvePriorityFromVerticalOffset("high", 44)).toBe("medium");
    expect(resolvePriorityFromVerticalOffset("high", 88)).toBe("low");
    expect(resolvePriorityFromVerticalOffset("high", 140)).toBe("none");
    // Clamps at None
    expect(resolvePriorityFromVerticalOffset("none", 200)).toBe("none");
  });

  it("optimistically updates cached priority and immediately re-sorts in priority mode", () => {
    const tasks: TodoItem[] = [
      makeTask({ id: "med", text: "Medium task", priority: "medium", createdAt: 100 }),
      makeTask({ id: "low", text: "Low task", priority: "low", createdAt: 200 }),
      makeTask({ id: "none", text: "None task", priority: "none", createdAt: 300 }),
    ];

    const updated = applyOptimisticTaskPriority(tasks, "none", "high");
    expect(updated?.find((t) => t.id === "none")?.priority).toBe("high");
    expect(tasks.find((t) => t.id === "none")?.priority).toBe("none");

    const sorted = sortTasks(updated ?? [], "priority");
    expect(sorted.map((t) => t.id)).toEqual(["none", "med", "low"]);
  });
});
