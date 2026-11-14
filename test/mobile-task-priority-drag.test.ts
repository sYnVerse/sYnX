import { describe, it, expect, vi } from "vitest";
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

  it("reverts the optimistic priority change cleanly when restoring a pre-drop snapshot after failure", () => {
    const initialTasks: TodoItem[] = [
      makeTask({ id: "t-1", text: "Task 1", priority: "low", createdAt: 100 }),
      makeTask({ id: "t-2", text: "Task 2", priority: "medium", createdAt: 200 }),
    ];
    let cache: TodoItem[] | undefined = initialTasks;
    const invalidateQueries = vi.fn();

    // Simulate handlePriorityDragEnd snapshot -> optimistic apply -> onError rollback
    const previousSnapshot = cache;
    cache = applyOptimisticTaskPriority(cache, "t-1", "high");
    expect(cache?.find((t) => t.id === "t-1")?.priority).toBe("high");
    expect(cache?.find((t) => t.id === "t-2")?.priority).toBe("medium");

    const onError = () => {
      if (previousSnapshot !== undefined) {
        cache = previousSnapshot;
      }
      invalidateQueries(["todos", "list-1"]);
    };
    onError();

    expect(cache).toBe(previousSnapshot);
    expect(cache?.find((t) => t.id === "t-1")?.priority).toBe("low");
    expect(invalidateQueries).toHaveBeenCalledWith(["todos", "list-1"]);
  });

  it("ignores plain taps on TaskRow grip and starts drag only once vertical threshold is exceeded", async () => {
    vi.resetModules();
    let capturedHandlers: Record<string, (...args: any[]) => any> | null = null;

    const createElement = (
      type: unknown,
      props: Record<string, any> | null,
      ...children: unknown[]
    ) => ({
      type,
      props: { ...(props ?? {}), children },
    });

    const useRef = <T>(initial: T) => ({ current: initial });
    const useState = <T>(init: T | (() => T)) => [
      typeof init === "function" ? (init as () => T)() : init,
      vi.fn(),
    ];
    const useMemo = <T>(factory: () => T) => factory();

    const reactStub = {
      default: { createElement, useRef, useState, useMemo },
      createElement,
      useRef,
      useState,
      useMemo,
    };
    const jsxStub = { jsx: createElement, jsxs: createElement, jsxDEV: createElement, Fragment: "Fragment" };
    const reactNativeStub = {
      View: "View",
      Text: "Text",
      TouchableOpacity: "TouchableOpacity",
      StyleSheet: { create: (s: any) => s },
      Animated: {
        Value: class {
          setValue = vi.fn();
        },
        View: "AnimatedView",
        spring: () => ({ start: vi.fn() }),
      },
      PanResponder: {
        create: (config: Record<string, (...args: any[]) => any>) => {
          capturedHandlers = config;
          return { panHandlers: config };
        },
      },
    };
    const Icon = () => null;
    const iconsStub = {
      Check: Icon,
      Clock: Icon,
      ListTree: Icon,
      Repeat: Icon,
      Bell: Icon,
      Plus: Icon,
      GripVertical: Icon,
    };

    const reactPaths = [
      "react",
      "../mobile/node_modules/react",
      "../mobile/node_modules/react/index.js",
      "../node_modules/react/index.js",
    ];
    const jsxPaths = [
      "react/jsx-runtime",
      "../mobile/node_modules/react/jsx-runtime",
      "../mobile/node_modules/react/jsx-runtime.js",
      "../node_modules/react/jsx-runtime.js",
      "react/jsx-dev-runtime",
      "../mobile/node_modules/react/jsx-dev-runtime",
      "../mobile/node_modules/react/jsx-dev-runtime.js",
      "../node_modules/react/jsx-dev-runtime.js",
    ];
    const rnPaths = [
      "react-native",
      "../mobile/node_modules/react-native",
      "../mobile/node_modules/react-native/index.js",
    ];
    const iconPaths = [
      "lucide-react-native",
      "../mobile/node_modules/lucide-react-native",
      "../mobile/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
    ];

    for (const p of reactPaths) vi.doMock(p, () => reactStub);
    for (const p of jsxPaths) vi.doMock(p, () => jsxStub);
    for (const p of rnPaths) vi.doMock(p, () => reactNativeStub);
    for (const p of iconPaths) vi.doMock(p, () => iconsStub);
    vi.doMock("../mobile/src/context/ThemeContext", () => ({
      useTheme: () => ({
        theme: {
          cardBg: "#111",
          cardBorder: "#222",
          accent: "#3b82f6",
          accentLight: "#dbeafe",
          shadowColor: "#000",
          checkboxBorder: "#666",
          textPrimary: "#fff",
          textSecondary: "#aaa",
          textMuted: "#888",
          inputBg: "#1a1a1a",
          danger: "#ef4444",
          priorityHigh: "#ef4444",
          priorityMedium: "#f59e0b",
          priorityLow: "#3b82f6",
        },
      }),
    }));
    vi.doMock("../mobile/src/theme/theme", () => ({
      typography: { xs: 11, sm: 13, md: 15 },
      MIN_TOUCH_TARGET: 44,
    }));
    vi.doMock("../mobile/src/utils/format", () => ({
      formatReminderPillLabel: () => "",
      priorityColor: () => "#f59e0b",
    }));

    const { TaskRow } = await import("../mobile/src/components/TaskRow");

    const task = makeTask({ id: "t-drag", priority: "low" });
    const onPriorityDragStart = vi.fn();
    const onPriorityDragHover = vi.fn();
    const onPriorityDragEnd = vi.fn();
    const onPriorityDragCancel = vi.fn();

    TaskRow({
      item: task,
      canEdit: true,
      isOwner: true,
      isPending: false,
      canDragPriority: true,
      onPriorityDragStart,
      onPriorityDragHover,
      onPriorityDragEnd,
      onPriorityDragCancel,
      onToggleCompleted: vi.fn(),
      onEdit: vi.fn(),
      onOpenSubtasks: vi.fn(),
    });

    expect(capturedHandlers).not.toBeNull();
    const handlers = capturedHandlers!;

    // Plain tap (|dy| <= 4) should never claim responder or flash the drag overlay
    expect(handlers.onStartShouldSetPanResponder({}, {})).toBe(false);
    expect(handlers.onMoveShouldSetPanResponder({}, { dy: 3 })).toBe(false);
    expect(onPriorityDragStart).not.toHaveBeenCalled();
    expect(onPriorityDragHover).not.toHaveBeenCalled();
    expect(onPriorityDragEnd).not.toHaveBeenCalled();

    // Drag past threshold (> 4px upward) claims responder, starts drag, updates preview, and commits on release
    expect(handlers.onMoveShouldSetPanResponder({}, { dy: -44 })).toBe(true);
    handlers.onPanResponderGrant({}, {});
    handlers.onPanResponderMove({}, { dy: -44 });
    expect(onPriorityDragStart).toHaveBeenCalledTimes(1);
    expect(onPriorityDragStart).toHaveBeenCalledWith(task);
    expect(onPriorityDragHover).toHaveBeenCalledWith(task, "medium");

    handlers.onPanResponderRelease({}, { dy: -44 });
    expect(onPriorityDragEnd).toHaveBeenCalledWith(task, "medium");

    // Terminated drag after claim cancels cleanly
    handlers.onPanResponderGrant({}, {});
    handlers.onPanResponderMove({}, { dy: 44 });
    handlers.onPanResponderTerminate({}, {});
    expect(onPriorityDragCancel).toHaveBeenCalledTimes(1);

    for (const p of [...reactPaths, ...jsxPaths, ...rnPaths, ...iconPaths]) vi.doUnmock(p);
    vi.doUnmock("../mobile/src/context/ThemeContext");
    vi.doUnmock("../mobile/src/theme/theme");
    vi.doUnmock("../mobile/src/utils/format");
  });
});
