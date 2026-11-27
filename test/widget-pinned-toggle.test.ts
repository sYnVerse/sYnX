import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import {
  buildListWidgetSnapshot,
  buildUpNextWidgetSnapshot,
  extractPendingWidgetOps,
  reconcileWidgetPendingOps,
  mergePendingOpsIntoSnapshot,
  removeHandledWidgetOps,
  applyReplayedWidgetOpsToTodos,
  classifyWidgetReplayError,
  toNativeWidgetProps,
  WIDGET_DOUBLE_TAP_GUARD_MS,
  WIDGET_UNDO_WINDOW_MS,
  type ListWidgetSnapshot,
  type WidgetReplayOutcome,
} from "../shared/widget-snapshot";
import type { TodoItem, TodoList } from "../shared";

const uiMocks = vi.hoisted(() => {
  const makePrimitive =
    (type: string) =>
    (props: Record<string, unknown> & { children?: ReactNode }) => ({
      type,
      props,
    });
  const Button = (
    props: Record<string, unknown> & {
      onClick?: () => unknown;
      target?: string;
      children?: ReactNode;
    }
  ) => {
    const { onClick, ...rest } = props;
    return {
      type: "Button",
      props: {
        ...rest,
        onButtonPressed: onClick ? () => onClick() : undefined,
      },
    };
  };
  const jetpackCompose = {
    Box: makePrimitive("Box"),
    Row: makePrimitive("Row"),
    Column: makePrimitive("Column"),
    Text: makePrimitive("Text"),
    Button,
    LazyColumn: makePrimitive("LazyColumn"),
  };
  const modifiers = {
    padding: (start: number, top: number, end: number, bottom: number) => ({
      $type: "padding",
      start,
      top,
      end,
      bottom,
    }),
    paddingAll: (all: number) => ({ $type: "paddingAll", all }),
    fillMaxSize: () => ({ $type: "fillMaxSize" }),
    fillMaxWidth: () => ({ $type: "fillMaxWidth" }),
    size: (width: number, height: number) => ({ $type: "size", width, height }),
    width: (width: number) => ({ $type: "width", width }),
    background: (color: string) => ({ $type: "background", color }),
    cornerRadius: (radius: number) => ({ $type: "cornerRadius", radius }),
  };
  const expoWidgets = {
    createWidget: vi.fn((_name: string, _layout: unknown, initialProps?: unknown) => ({
      reload: vi.fn(),
      updateTimeline: vi.fn(),
      updateSnapshot: vi.fn(),
      getSnapshot: vi.fn(() => initialProps ?? null),
    })),
  };
  return { jetpackCompose, modifiers, expoWidgets };
});

vi.mock("expo-widgets", () => uiMocks.expoWidgets);
vi.mock("../node_modules/expo-widgets", () => uiMocks.expoWidgets);
vi.mock("@expo/ui/jetpack-compose", () => uiMocks.jetpackCompose);
vi.mock("../node_modules/@expo/ui/jetpack-compose", () => uiMocks.jetpackCompose);
vi.mock(
  "../node_modules/@expo/ui/build/jetpack-compose/index.js",
  () => uiMocks.jetpackCompose
);
vi.mock("@expo/ui/jetpack-compose/modifiers", () => uiMocks.modifiers);
vi.mock("../node_modules/@expo/ui/jetpack-compose/modifiers", () => uiMocks.modifiers);
vi.mock(
  "../node_modules/@expo/ui/build/jetpack-compose/modifiers/index.js",
  () => uiMocks.modifiers
);

import { PinnedListWidget } from "../mobile/src/widgets/PinnedListWidget";
import { CurrentListWidget } from "../mobile/src/widgets/CurrentListWidget";

interface WidgetElementNode {
  type: unknown;
  props: Record<string, unknown> & {
    target?: string;
    onButtonPressed?: () => Record<string, unknown> | undefined;
    children?: unknown;
  };
}

/**
 * Normalizes a rendered widget element tree the same way `expo-widgets/bundle/index.ts`
 * does before dispatching press targets to native Glance or worklet handlers.
 */
function normalizeWidgetTree(node: unknown): unknown {
  while (
    node &&
    typeof node === "object" &&
    "type" in node &&
    typeof (node as WidgetElementNode).type === "function"
  ) {
    const el = node as WidgetElementNode;
    node = (el.type as (props: Record<string, unknown>) => unknown)(el.props);
  }
  if (Array.isArray(node)) {
    return node.flat(Infinity).map((child) => normalizeWidgetTree(child));
  }
  if (node && typeof node === "object" && "type" in node && "props" in node) {
    const el = node as WidgetElementNode;
    const props = { ...el.props };
    if ("children" in props) {
      props.children = normalizeWidgetTree(props.children);
    }
    return { ...el, props };
  }
  return node;
}

function collectNodes(node: unknown, predicate: (el: WidgetElementNode) => boolean): WidgetElementNode[] {
  const results: WidgetElementNode[] = [];
  const visit = (cur: unknown) => {
    if (!cur) return;
    if (Array.isArray(cur)) {
      for (const item of cur) visit(item);
      return;
    }
    if (typeof cur === "object" && "type" in cur && "props" in cur) {
      const el = cur as WidgetElementNode;
      if (predicate(el)) results.push(el);
      if ("children" in el.props) visit(el.props.children);
    }
  };
  visit(node);
  return results;
}

function extractTextContent(node: unknown): string {
  const texts = collectNodes(node, (el) => el.type === "Text");
  return texts
    .map((el) => {
      const c = el.props.children;
      if (typeof c === "string" || typeof c === "number") return String(c);
      if (Array.isArray(c)) return c.join("");
      return "";
    })
    .join(" ");
}

type WidgetComponent = (
  props: ListWidgetSnapshot,
  environment: { colorScheme?: "light" | "dark"; width?: number; height?: number }
) => unknown;

function renderRealWidget(widgetFn: WidgetComponent, props: ListWidgetSnapshot): unknown {
  return normalizeWidgetTree(widgetFn(props, { colorScheme: "dark", width: 320, height: 220 }));
}

/**
 * Simulates an Android widget button press using the exact `target` matching path
 * from `expo-widgets` (`findAndCallOnPress` + `WidgetInteractionAction.kt`).
 */
function pressWidgetTarget(
  widgetFn: WidgetComponent,
  props: ListWidgetSnapshot,
  target: string,
  at: number,
  options?: { allowMissingTarget?: boolean }
): ListWidgetSnapshot {
  const nowSpy = vi.spyOn(Date, "now").mockReturnValue(at);
  try {
    const tree = renderRealWidget(widgetFn, props);
    const matchingButtons = collectNodes(
      tree,
      (el) => el.type === "Button" && el.props.target === target
    );
    if (matchingButtons.length === 0 && options?.allowMissingTarget) {
      return props;
    }
    expect(matchingButtons.length).toBeGreaterThan(0);
    const updatedProps = matchingButtons[0].props.onButtonPressed?.();
    if (!updatedProps) return props;
    return { ...props, ...updatedProps } as ListWidgetSnapshot;
  } finally {
    nowSpy.mockRestore();
  }
}

const baseNow = 1_700_000_000_000;

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
    text: `Task ${id}`,
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
  todo("p-1", pinnedList.id, { createdAt: 4000 }),
  todo("p-2", pinnedList.id, { reminderAt: baseNow + 60_000, createdAt: 3000 }),
  todo("p-3", pinnedList.id, { createdAt: 2000 }),
  todo("p-done", pinnedList.id, { completed: true, createdAt: 1000 }),
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ["PinnedListWidget", PinnedListWidget],
  ["CurrentListWidget", CurrentListWidget],
] as const)("%s real widget interaction & row stability (#254)", (_widgetName, WidgetFn) => {
  it("only attaches complete:<id> to the checkbox and opens the task on row-body tap", () => {
    const snap = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const tree = renderRealWidget(WidgetFn, snap);
    const buttons = collectNodes(tree, (el) => el.type === "Button");

    const completeButtons = buttons.filter((b) => b.props.target?.startsWith("complete:"));
    const taskOpenButtons = buttons.filter((b) =>
      b.props.target?.startsWith(`open:synx://list/${snap.listId}?task=`)
    );

    expect(completeButtons.map((b) => b.props.target)).toEqual([
      "complete:p-2",
      "complete:p-1",
      "complete:p-3",
    ]);
    for (const cb of completeButtons) {
      expect(typeof cb.props.onButtonPressed).toBe("function");
      // The checkbox button must contain only the drawn box, never task title text.
      expect(extractTextContent(cb.props.children).trim()).toBe("");
    }

    expect(taskOpenButtons.map((b) => b.props.target)).toEqual([
      `open:synx://list/${snap.listId}?task=p-2`,
      `open:synx://list/${snap.listId}?task=p-1`,
      `open:synx://list/${snap.listId}?task=p-3`,
    ]);
    for (const openBtn of taskOpenButtons) {
      expect(openBtn.props.onButtonPressed).toBeUndefined();
      expect(extractTextContent(openBtn.props.children)).toContain("Task p-");
    }

    // View-only snapshots have no complete targets, and tapping a row opens the task.
    const viewOnly = buildListWidgetSnapshot({ ...pinnedList, canEdit: false }, pinnedTodos, {
      now: baseNow,
    });
    const viewTree = renderRealWidget(WidgetFn, viewOnly);
    const viewButtons = collectNodes(viewTree, (el) => el.type === "Button");
    expect(viewButtons.filter((b) => b.props.target?.startsWith("complete:"))).toEqual([]);
    expect(
      viewButtons.filter((b) =>
        b.props.target?.startsWith(`open:synx://list/${viewOnly.listId}?task=`)
      )
    ).toHaveLength(3);
  });

  it("one checkbox tap queues that exact task ID, increments doneCount, and keeps rows in place with Undo", () => {
    const initial = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    expect(initial.tasks.map((t) => t.id)).toEqual(["p-2", "p-1", "p-3"]);

    const afterTap = pressWidgetTarget(WidgetFn, initial, "complete:p-1", baseNow + 100);
    const ops = extractPendingWidgetOps(afterTap);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      todoId: "p-1",
      listId: pinnedList.id,
      completed: true,
      at: baseNow + 100,
    });
    expect(ops[0].opId).toMatch(/^w_p-1_/);
    expect(afterTap.doneCount).toBe(2);
    expect(afterTap.lastTapAt).toBe(baseNow + 100);

    // Rows must not shift or disappear right away: p-1 stays at index 1 in place.
    expect(afterTap.tasks.map((t) => t.id)).toEqual(["p-2", "p-1", "p-3"]);
    expect(afterTap.tasks[1].completed).toBe(true);
    expect(afterTap.tasks[1].pendingCompletedAt).toBe(baseNow + 100);
    expect(afterTap.tasks[0].completed).toBe(false);
    expect(afterTap.tasks[2].completed).toBe(false);

    // Rendered pending row shows strikethrough text and an Undo target.
    const pendingTree = renderRealWidget(WidgetFn, afterTap);
    const struckTexts = collectNodes(
      pendingTree,
      (el) =>
        el.type === "Text" &&
        (el.props.style as { textDecoration?: string } | undefined)?.textDecoration === "lineThrough"
    );
    expect(struckTexts.map((t) => t.props.children)).toEqual(["Task p-1"]);
    const undoButtons = collectNodes(
      pendingTree,
      (el) => el.type === "Button" && el.props.target === "undo:p-1"
    );
    expect(undoButtons.length).toBeGreaterThanOrEqual(1);
    expect(extractTextContent(pendingTree)).toContain("Undo");
  });

  it("ignores a stale repeat complete tap on an already pending-checked task", () => {
    const initial = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const afterFirst = pressWidgetTarget(WidgetFn, initial, "complete:p-1", baseNow + 100);
    // Simulate another broadcast firing the same target well outside the 800ms window.
    const tree = renderRealWidget(WidgetFn, afterFirst);
    expect(
      collectNodes(tree, (el) => el.type === "Button" && el.props.target === "complete:p-1")
    ).toHaveLength(0);
    expect(
      pressWidgetTarget(WidgetFn, afterFirst, "complete:p-1", baseNow + 1_500, {
        allowMissingTarget: true,
      })
    ).toBe(afterFirst);

    // Tap another task normally, then verify complete:p-1 wasn't duplicated and count stays accurate.
    const afterFirstClean = toNativeWidgetProps(afterFirst);
    const afterOtherTap = pressWidgetTarget(
      WidgetFn,
      afterFirstClean,
      "complete:p-3",
      baseNow + 100 + WIDGET_DOUBLE_TAP_GUARD_MS + 50
    );
    expect(afterOtherTap.pendingOps.map((o) => o.todoId)).toEqual(["p-1", "p-3"]);
    expect(afterOtherTap.doneCount).toBe(3);
  });

  it("ignores a second complete tap within 800 ms on the same widget and accepts after 800 ms", () => {
    const initial = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const t0 = baseNow + 1_000;
    const afterFirst = pressWidgetTarget(WidgetFn, initial, "complete:p-2", t0);

    const ignoredAt400 = pressWidgetTarget(WidgetFn, afterFirst, "complete:p-1", t0 + 400);
    expect(ignoredAt400).toBe(afterFirst);
    expect(ignoredAt400.pendingOps.map((o) => o.todoId)).toEqual(["p-2"]);
    expect(ignoredAt400.tasks[1].completed).toBe(false);
    expect(ignoredAt400.doneCount).toBe(2);

    const ignoredAt799 = pressWidgetTarget(WidgetFn, afterFirst, "complete:p-1", t0 + 799);
    expect(ignoredAt799).toBe(afterFirst);

    const acceptedAt800 = pressWidgetTarget(
      WidgetFn,
      afterFirst,
      "complete:p-1",
      t0 + WIDGET_DOUBLE_TAP_GUARD_MS
    );
    expect(acceptedAt800.pendingOps.map((o) => o.todoId)).toEqual(["p-2", "p-1"]);
    expect(acceptedAt800.tasks.map((t) => t.id)).toEqual(["p-2", "p-1", "p-3"]);
    expect(acceptedAt800.tasks[1].completed).toBe(true);
    expect(acceptedAt800.doneCount).toBe(3);
  });

  it("cancels the check-off and restores the row cleanly when Undo is tapped (even within 800 ms)", () => {
    const initial = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const afterCheck = pressWidgetTarget(WidgetFn, initial, "complete:p-1", baseNow + 500);
    const afterUndo = pressWidgetTarget(WidgetFn, afterCheck, "undo:p-1", baseNow + 700);

    expect(afterUndo.tasks.map((t) => t.id)).toEqual(["p-2", "p-1", "p-3"]);
    expect(afterUndo.tasks[1].completed).toBe(false);
    expect(afterUndo.tasks[1].pendingCompletedAt).toBeUndefined();
    expect(afterUndo.doneCount).toBe(1);
    expect(afterUndo.lastTapAt).toBe(0);

    const reconciled = reconcileWidgetPendingOps(extractPendingWidgetOps(afterUndo));
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
      todoId: "p-1",
      listId: pinnedList.id,
      completed: false,
      at: baseNow + 700,
    });

    // Bridge-safe after undo (no undefined values) and another complete tap is allowed immediately.
    const cleanProps = toNativeWidgetProps(afterUndo);
    const immediateNext = pressWidgetTarget(WidgetFn, cleanProps, "complete:p-3", baseNow + 750);
    expect(immediateNext.tasks[2].completed).toBe(true);
    expect(immediateNext.doneCount).toBe(2);
  });

  it("keeps pending check-offs in place and row order stable across snapshot rebuilds until window expires", () => {
    const initial = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const tappedAt = baseNow + 500;
    const afterTap = pressWidgetTarget(WidgetFn, initial, "complete:p-1", tappedAt);

    // Case A: Stale cache rebuild with a different sort where fresh order puts p-3 first (["p-3", "p-2", "p-1"]).
    const reorderedTodos = pinnedTodos.map((t) =>
      t.id === "p-3" ? { ...t, priority: "high" as const } : t
    );
    const staleRebuilt = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, reorderedTodos, { now: tappedAt + 1_000, sortMode: "priority" }),
      extractPendingWidgetOps(afterTap),
      { previousSnapshot: afterTap, now: tappedAt + 1_000 }
    );
    expect(staleRebuilt.tasks.map((t) => t.id)).toEqual(["p-2", "p-1", "p-3"]);
    expect(staleRebuilt.tasks[1]).toMatchObject({
      id: "p-1",
      completed: true,
      pendingCompletedAt: tappedAt,
    });
    expect(staleRebuilt.doneCount).toBe(2);
    expect(staleRebuilt.lastTapAt).toBe(tappedAt);

    // Case B: Server already applied p-1 (removed from open fresh snapshot), but undo window is still active.
    const serverUpdatedTodos = reorderedTodos.map((t) =>
      t.id === "p-1" ? { ...t, completed: true } : t
    );
    const serverRebuiltInsideWindow = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, serverUpdatedTodos, { now: tappedAt + 3_000, sortMode: "priority" }),
      [],
      { previousSnapshot: afterTap, now: tappedAt + 3_000 }
    );
    expect(serverRebuiltInsideWindow.tasks.map((t) => t.id)).toEqual(["p-2", "p-1", "p-3"]);
    expect(serverRebuiltInsideWindow.tasks[1]).toMatchObject({
      id: "p-1",
      completed: true,
      pendingCompletedAt: tappedAt,
    });
    // Must not double-count p-1 (server snapshot already counted p-1 as done -> 2).
    expect(serverRebuiltInsideWindow.doneCount).toBe(2);

    // Case C: Undo window expires (10s) -> pending row is removed and fresh priority order resumes.
    const afterExpiry = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, serverUpdatedTodos, {
        now: tappedAt + WIDGET_UNDO_WINDOW_MS,
        sortMode: "priority",
      }),
      [],
      { previousSnapshot: serverRebuiltInsideWindow, now: tappedAt + WIDGET_UNDO_WINDOW_MS }
    );
    expect(afterExpiry.tasks.map((t) => t.id)).toEqual(["p-3", "p-2"]);
    expect(afterExpiry.doneCount).toBe(2);

    // Case D: Opening the app (undoWindowMs: 0) flushes pending row immediately even at +1s.
    const onAppOpen = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, serverUpdatedTodos, { now: tappedAt + 1_000 }),
      [],
      { previousSnapshot: afterTap, now: tappedAt + 1_000, undoWindowMs: 0 }
    );
    expect(onAppOpen.tasks.map((t) => t.id)).toEqual(["p-2", "p-3"]);
  });

  it("queues a stale complete tap from the real widget as a no-op if task is already completed in snapshot", () => {
    const snap = buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const withAlreadyPending: ListWidgetSnapshot = {
      ...snap,
      tasks: snap.tasks.map((t) =>
        t.id === "p-1" ? { ...t, completed: true, pendingCompletedAt: baseNow } : t
      ),
    };
    const tree = renderRealWidget(WidgetFn, withAlreadyPending);
    expect(
      collectNodes(tree, (el) => el.type === "Button" && el.props.target === "complete:p-1")
    ).toHaveLength(0);
  });
});

describe("pinned list widget queue & cache reconciliation", () => {
  it("keeps the pinned queue in Up Next mode too when tapped through the real PinnedListWidget", () => {
    const upNext = buildUpNextWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow });
    const tapped = pressWidgetTarget(PinnedListWidget, upNext, "complete:p-2", baseNow + 100);
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildUpNextWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow + 200 }),
      extractPendingWidgetOps(tapped),
      { previousSnapshot: tapped, now: baseNow + 200 }
    );
    expect(rebuilt.tasks.map((t) => t.id)).toEqual(["p-2"]);
    expect(rebuilt.tasks[0].completed).toBe(true);
    expect(rebuilt.pendingOps[0].listId).toBe("list-pinned");

    const afterExpiry = mergePendingOpsIntoSnapshot(
      buildUpNextWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow + 100 + WIDGET_UNDO_WINDOW_MS }),
      extractPendingWidgetOps(tapped),
      { previousSnapshot: rebuilt, now: baseNow + 100 + WIDGET_UNDO_WINDOW_MS }
    );
    expect(afterExpiry.tasks).toEqual([]);
  });

  it("keeps another list's queued ops without hiding or counting them", () => {
    const otherListOp = { todoId: "p-1", listId: "list-pinned", completed: true, at: baseNow };
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(activeList, activeTodos, { now: baseNow }),
      [otherListOp],
      { now: baseNow + 1 }
    );
    expect(rebuilt.pendingOps).toEqual([otherListOp]);
    expect(rebuilt.tasks.map((t) => t.id).sort()).toEqual(["a-1", "a-2"]);
    expect(rebuilt.doneCount).toBe(0);
  });

  it("updates the pinned list's cached tasks after a successful replay and leaves the active list alone", () => {
    const op = { todoId: "p-1", listId: "list-pinned", completed: true, at: baseNow + 1 };
    const outcomes: WidgetReplayOutcome[] = [
      { op, status: "applied", todo: { ...pinnedTodos[0], completed: true } },
    ];
    const pinnedCache = applyReplayedWidgetOpsToTodos(pinnedTodos, outcomes)!;
    expect(pinnedCache.find((t) => t.id === "p-1")?.completed).toBe(true);
    expect(applyReplayedWidgetOpsToTodos(activeTodos, [])).toBe(activeTodos);

    const remaining = removeHandledWidgetOps([op], [op]);
    expect(remaining).toEqual([]);
    const rebuilt = mergePendingOpsIntoSnapshot(
      buildListWidgetSnapshot(pinnedList, pinnedCache, { now: baseNow + 3 }),
      remaining,
      { now: baseNow + 3 }
    );
    expect(rebuilt.tasks.map((t) => t.id)).toEqual(["p-2", "p-3"]);
    expect(rebuilt.doneCount).toBe(2);
    expect(rebuilt.pendingOps).toEqual([]);
  });

  it("applies the done state locally when the server response has no todo", () => {
    const op = { todoId: "p-2", listId: "list-pinned", completed: true, at: baseNow };
    const next = applyReplayedWidgetOpsToTodos(pinnedTodos, [{ op, status: "applied" }])!;
    expect(next.find((t) => t.id === "p-2")?.completed).toBe(true);
  });

  it("patches a subtask nested under its parent", () => {
    const parent = todo("p-parent", pinnedList.id, {
      subtasks: [todo("p-sub", pinnedList.id, { parentId: "p-parent" })],
    });
    const op = { todoId: "p-sub", listId: "list-pinned", completed: true, at: baseNow };
    const next = applyReplayedWidgetOpsToTodos([parent], [{ op, status: "applied" }])!;
    expect(next[0].subtasks?.[0].completed).toBe(true);
    expect(next[0].completed).toBe(false);
  });

  it("keeps ops that fail for a temporary reason and only clears handled ones", () => {
    expect(classifyWidgetReplayError(undefined)).toBe("retry");
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

  it("replays the latest action per task across both real widgets", () => {
    const currentSnap = pressWidgetTarget(
      CurrentListWidget,
      buildListWidgetSnapshot(activeList, activeTodos, { now: baseNow }),
      "complete:a-1",
      baseNow + 5
    );
    const pinnedSnap = pressWidgetTarget(
      PinnedListWidget,
      buildListWidgetSnapshot(pinnedList, pinnedTodos, { now: baseNow }),
      "complete:p-1",
      baseNow + 4
    );
    const reconciled = reconcileWidgetPendingOps([
      ...extractPendingWidgetOps(currentSnap),
      ...extractPendingWidgetOps(pinnedSnap),
    ]);
    expect(reconciled.map((o) => `${o.listId}:${o.todoId}`).sort()).toEqual([
      "list-active:a-1",
      "list-pinned:p-1",
    ]);
  });
});

describe("list widget rows structural checks", () => {
  it("both CurrentListWidget and PinnedListWidget have no native Checkbox and wire complete, undo, and task deep-link targets", async () => {
    const currentWidgetSource = (await import("../mobile/src/widgets/CurrentListWidget.tsx?raw")).default;
    const pinnedWidgetSource = (await import("../mobile/src/widgets/PinnedListWidget.tsx?raw")).default;
    for (const source of [currentWidgetSource, pinnedWidgetSource]) {
      expect(source).not.toMatch(/<Checkbox\b/);
      expect(source).toContain("target={`complete:${task.id}`}");
      expect(source).toContain("target={`undo:${task.id}`}");
      expect(source).toContain("target={`open:synx://list/${props.listId}?task=${task.id}`}");
      expect(source).toContain("listId: props.listId");
    }
  });
});
