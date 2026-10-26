import { describe, it, expect } from "vitest";
import {
  buildListWidgetSnapshot,
  buildUpNextWidgetSnapshot,
  extractPendingWidgetOps,
  reconcileWidgetPendingOps,
  mergePendingOpsIntoSnapshot,
  removeHandledWidgetOps,
  applyReplayedWidgetOpsToTodos,
  classifyWidgetReplayError,
  type ListWidgetSnapshot,
  type WidgetReplayOutcome,
} from "../shared/widget-snapshot";
import type { TodoItem, TodoList } from "../shared";
import currentWidgetSource from "../mobile/src/widgets/CurrentListWidget.tsx?raw";
import pinnedWidgetSource from "../mobile/src/widgets/PinnedListWidget.tsx?raw";

const now = 1_700_000_000_000;

const activeList: TodoList = {
  id: "list-active",
  name: "Groceries",
  category: "Shopping",
  ownerId: "user-1",
  createdAt: 1000,
  shareMode: "private",
  isOwner: true,
  canEdit: true,
};

const pinnedList: TodoList = {
  id: "list-pinned",
  name: "Various",
  category: "Checklist",
  ownerId: "user-2",
  createdAt: 1000,
  shareMode: "public_edit",
  isOwner: false,
  canEdit: true,
  owner: { displayName: "Sam" },
} as TodoList;

function todo(id: string, listId: string, extra: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    listId,
    text: id,
    completed: false,
    priority: "none",
    recurrence: "none",
    reminderSent: false,
    createdAt: 1000,
    ...extra,
  };
}

const activeTodos = [todo("a-1", activeList.id), todo("a-2", activeList.id)];
const pinnedTodos = [
  todo("p-1", pinnedList.id),
  todo("p-2", pinnedList.id, { reminderAt: now + 60_000 }),
  todo("p-3", pinnedList.id, { completed: true }),
];

/** Mirrors the row onClick worklet in PinnedListWidget / CurrentListWidget. */
function tapTask(props: ListWidgetSnapshot, taskId: string, at: number): ListWidgetSnapshot {
  return {
    ...props,
    tasks: (props.tasks || []).filter((t) => t.id !== taskId),
    doneCount: (props.doneCount || 0) + 1,
    pendingOps: [
      ...(props.pendingOps || []),
      { todoId: taskId, listId: props.listId, completed: true, at },
    ],
  };
}

describe("pinned list widget checkoff when the pinned list isn't the active list", () => {
  it("queues the op against the pinned list, not the active list", () => {
    const pinned = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now });
    const tapped = tapTask(pinned, "p-1", now + 1);
    const ops = extractPendingWidgetOps(tapped);
    expect(ops).toEqual([{ todoId: "p-1", listId: "list-pinned", completed: true, at: now + 1 }]);
    expect(tapped.tasks.map((t) => t.id)).toEqual(["p-2"]);
    expect(tapped.doneCount).toBe(2);
  });

  it("keeps a queued tap when the widget is rebuilt from stale data before the replay", () => {
    const tapped = tapTask(buildListWidgetSnapshot(pinnedList, pinnedTodos, { now }), "p-1", now + 1);
    // An app-side sync rebuilds the pinned widget from the (still stale) cache.
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: now + 2 }),
      extractPendingWidgetOps(tapped)
    );
    expect(rebuilt.pendingOps).toEqual(tapped.pendingOps);
    expect(rebuilt.tasks.map((t) => t.id)).toEqual(["p-2"]);
    expect(rebuilt.doneCount).toBe(2);
    expect(rebuilt.totalCount).toBe(3);
  });

  it("keeps the pinned queue in Up Next mode too", () => {
    const upNext = buildUpNextWidgetSnapshot(pinnedList, pinnedTodos, { now });
    const tapped = tapTask(upNext, "p-2", now + 1);
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildUpNextWidgetSnapshot(pinnedList, pinnedTodos, { now: now + 2 }),
      extractPendingWidgetOps(tapped)
    );
    expect(rebuilt.tasks).toEqual([]);
    expect(rebuilt.pendingOps[0].listId).toBe("list-pinned");
  });

  it("keeps another list's queued ops without hiding or counting them", () => {
    const otherListOp = { todoId: "p-1", listId: "list-pinned", completed: true, at: now };
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(activeList, activeTodos, { now }),
      [otherListOp]
    );
    // Still queued, so switching lists before the replay can't drop the tap.
    expect(rebuilt.pendingOps).toEqual([otherListOp]);
    expect(rebuilt.tasks.map((t) => t.id).sort()).toEqual(["a-1", "a-2"]);
    expect(rebuilt.doneCount).toBe(0);
  });

  it("updates the pinned list's cached tasks after a successful replay and leaves the active list alone", () => {
    const op = { todoId: "p-1", listId: "list-pinned", completed: true, at: now + 1 };
    const outcomes: WidgetReplayOutcome[] = [
      { op, status: "applied", todo: { ...pinnedTodos[0], completed: true } },
    ];
    const pinnedCache = applyReplayedWidgetOpsToTodos(pinnedTodos, outcomes)!;
    expect(pinnedCache.find((t) => t.id === "p-1")?.completed).toBe(true);
    expect(applyReplayedWidgetOpsToTodos(activeTodos, [])).toBe(activeTodos);

    // Queue is cleared, and the widget rebuilt from the updated cache stays consistent.
    const remaining = removeHandledWidgetOps([op], [op]);
    expect(remaining).toEqual([]);
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, pinnedCache, { now: now + 3 }),
      remaining
    );
    expect(rebuilt.tasks.map((t) => t.id)).toEqual(["p-2"]);
    expect(rebuilt.doneCount).toBe(2);
    expect(rebuilt.pendingOps).toEqual([]);
  });

  it("applies the done state locally when the server response has no todo", () => {
    const op = { todoId: "p-2", listId: "list-pinned", completed: true, at: now };
    const next = applyReplayedWidgetOpsToTodos(pinnedTodos, [{ op, status: "applied" }])!;
    expect(next.find((t) => t.id === "p-2")?.completed).toBe(true);
  });

  it("patches a subtask nested under its parent", () => {
    const parent = todo("p-parent", pinnedList.id, {
      subtasks: [todo("p-sub", pinnedList.id, { parentId: "p-parent" })],
    });
    const op = { todoId: "p-sub", listId: "list-pinned", completed: true, at: now };
    const next = applyReplayedWidgetOpsToTodos([parent], [{ op, status: "applied" }])!;
    expect(next[0].subtasks?.[0].completed).toBe(true);
    expect(next[0].completed).toBe(false);
  });

  it("keeps ops that fail for a temporary reason and only clears handled ones", () => {
    expect(classifyWidgetReplayError(undefined)).toBe("retry"); // offline
    expect(classifyWidgetReplayError(500)).toBe("retry");
    expect(classifyWidgetReplayError(401)).toBe("retry");
    expect(classifyWidgetReplayError(429)).toBe("retry");
    expect(classifyWidgetReplayError(403)).toBe("rejected");
    expect(classifyWidgetReplayError(404)).toBe("rejected");

    const handled = { todoId: "p-1", listId: "list-pinned", completed: true, at: 1 };
    const failed = { todoId: "p-2", listId: "list-pinned", completed: true, at: 2 };
    const tappedDuringReplay = { todoId: "a-1", listId: "list-active", completed: true, at: 3 };
    expect(removeHandledWidgetOps([handled, failed, tappedDuringReplay], [handled])).toEqual([
      failed,
      tappedDuringReplay,
    ]);
  });

  it("replays the latest action per task across both widgets", () => {
    const fromCurrent = [{ todoId: "a-1", listId: "list-active", completed: true, at: 5 }];
    const fromPinned = [{ todoId: "p-1", listId: "list-pinned", completed: true, at: 4 }];
    const reconciled = reconcileWidgetPendingOps([...fromCurrent, ...fromPinned]);
    expect(reconciled.map((o) => `${o.listId}:${o.todoId}`).sort()).toEqual([
      "list-active:a-1",
      "list-pinned:p-1",
    ]);
  });
});

describe("list widget rows", () => {
  for (const [name, source] of [
    ["CurrentListWidget", currentWidgetSource],
    ["PinnedListWidget", pinnedWidgetSource],
  ] as const) {
    it(`${name} has no native Checkbox that would swallow the row tap`, () => {
      expect(source).not.toMatch(/<Checkbox\b/);
      expect(source).toContain("target={`complete:${task.id}`}");
      expect(source).toContain("listId: props.listId");
    });
  }
});
