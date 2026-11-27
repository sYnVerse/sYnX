import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import {
  buildListWidgetSnapshot,
  WIDGET_UNDO_WINDOW_MS,
  type ListWidgetSnapshot,
} from "../shared/widget-snapshot";
import type { TodoItem, TodoList } from "../shared";

const mocks = vi.hoisted(() => {
  const widgetSnapshots = new Map<string, Record<string, unknown>>();
  const interactionListeners = new Set<(event: { source: string; target: string; timestamp: number }) => void>();
  const appStateListeners = new Set<(nextState: string) => void>();

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

  const reactNative = {
    AppState: {
      currentState: "active",
      addEventListener: vi.fn((_type: string, cb: (state: string) => void) => {
        appStateListeners.add(cb);
        return {
          remove: () => {
            appStateListeners.delete(cb);
          },
        };
      }),
    },
    Platform: { OS: "android" },
  };

  const expoWidgets = {
    createWidget: vi.fn((name: string, _layout: unknown, initialProps?: Record<string, unknown>) => {
      if (initialProps && !widgetSnapshots.has(name)) {
        widgetSnapshots.set(name, { ...initialProps });
      }
      return {
        reload: vi.fn(),
        updateTimeline: vi.fn(),
        updateSnapshot: vi.fn((props: Record<string, unknown>) => {
          widgetSnapshots.set(name, props);
        }),
        getSnapshot: vi.fn(() => widgetSnapshots.get(name) ?? null),
      };
    }),
    addUserInteractionListener: vi.fn(
      (cb: (event: { source: string; target: string; timestamp: number }) => void) => {
        interactionListeners.add(cb);
        return {
          remove: () => {
            interactionListeners.delete(cb);
          },
        };
      }
    ),
  };

  const jetpackCompose = {
    Box: makePrimitive("Box"),
    Row: makePrimitive("Row"),
    Column: makePrimitive("Column"),
    Text: makePrimitive("Text"),
    Button,
    LazyColumn: makePrimitive("LazyColumn"),
    Image: makePrimitive("Image"),
    LinearProgressIndicator: makePrimitive("LinearProgressIndicator"),
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

  const apiClient = {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  };

  return {
    widgetSnapshots,
    interactionListeners,
    appStateListeners,
    reactNative,
    expoWidgets,
    jetpackCompose,
    modifiers,
    apiClient,
    getLastActiveListId: vi.fn<() => Promise<string | null>>(async () => "list-pinned"),
    getPinnedWidgetConfig: vi.fn<() => Promise<{ mode: "list" | "reminders"; listId: string } | null>>(
      async () => ({ mode: "list", listId: "list-pinned" })
    ),
    getAccessToken: vi.fn<() => Promise<string | null>>(async () => "mock-token"),
  };
});

vi.mock("react-native", () => mocks.reactNative);
vi.mock("../node_modules/react-native", () => mocks.reactNative);
vi.mock("expo-widgets", () => mocks.expoWidgets);
vi.mock("../node_modules/expo-widgets", () => mocks.expoWidgets);
vi.mock("@expo/ui/jetpack-compose", () => mocks.jetpackCompose);
vi.mock("../node_modules/@expo/ui/jetpack-compose", () => mocks.jetpackCompose);
vi.mock(
  "../node_modules/@expo/ui/build/jetpack-compose/index.js",
  () => mocks.jetpackCompose
);
vi.mock("@expo/ui/jetpack-compose/modifiers", () => mocks.modifiers);
vi.mock("../node_modules/@expo/ui/jetpack-compose/modifiers", () => mocks.modifiers);
vi.mock(
  "../node_modules/@expo/ui/build/jetpack-compose/modifiers/index.js",
  () => mocks.modifiers
);

vi.mock("../mobile/src/api/client", () => ({
  apiClient: mocks.apiClient,
  secureSessionStore: { getAccessToken: mocks.getAccessToken },
}));
vi.mock("../mobile/src/services/calendar", () => ({
  reconcileTasksWithNativeCalendar: vi.fn(async () => 0),
}));
vi.mock("../mobile/src/services/listNames", () => ({
  getCachedListName: vi.fn(() => "Pinned"),
}));
vi.mock("../mobile/src/services/taskSortPreferences", () => ({
  getTaskSortPreferences: vi.fn(() => ({ appDefault: "created", overrides: {} })),
  loadTaskSortPreferences: vi.fn(async () => undefined),
  subscribeTaskSortPreferences: vi.fn(() => () => undefined),
}));
vi.mock("../mobile/src/services/widgetPreferences", () => ({
  getLastActiveListId: mocks.getLastActiveListId,
  getPinnedWidgetConfig: mocks.getPinnedWidgetConfig,
}));

import pinnedListWidgetHandle, { PinnedListWidget } from "../mobile/src/widgets/PinnedListWidget";
import currentListWidgetHandle from "../mobile/src/widgets/CurrentListWidget";
import {
  drainAndReplayPendingWidgetOps,
  startWidgetSyncService,
} from "../mobile/src/services/widgetSync";

interface WidgetElementNode {
  type: unknown;
  props: Record<string, unknown> & {
    target?: string;
    onButtonPressed?: () => Record<string, unknown> | undefined;
    children?: unknown;
  };
}

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
    return node.flat(Infinity).map((c) => normalizeWidgetTree(c));
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

function findButtonByTarget(node: unknown, target: string): WidgetElementNode | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findButtonByTarget(item, target);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === "object" && "type" in node && "props" in node) {
    const el = node as WidgetElementNode;
    if (el.type === "Button" && el.props.target === target) return el;
    if ("children" in el.props) return findButtonByTarget(el.props.children, target);
  }
  return null;
}

function getPinnedSnapshot(): ListWidgetSnapshot {
  return mocks.widgetSnapshots.get("PinnedListWidget") as unknown as ListWidgetSnapshot;
}

function simulateNativeWidgetTap(target: string, at: number): void {
  const prevSnap = getPinnedSnapshot();
  const nowSpy = vi.spyOn(Date, "now").mockReturnValue(at);
  try {
    const tree = normalizeWidgetTree(
      PinnedListWidget(prevSnap, { colorScheme: "dark", width: 320, height: 220 })
    );
    const btn = findButtonByTarget(tree, target);
    expect(btn).not.toBeNull();
    const updated = btn?.props.onButtonPressed?.();
    if (updated) {
      pinnedListWidgetHandle.updateSnapshot({
        ...prevSnap,
        ...updated,
      } as ListWidgetSnapshot);
    }
  } finally {
    nowSpy.mockRestore();
  }
}

function createFakeQueryClient(initialList: TodoList, initialTodos: TodoItem[]) {
  const data = new Map<string, unknown>([
    [JSON.stringify(["list_meta", initialList.id]), initialList],
    [JSON.stringify(["todos", initialList.id]), initialTodos],
  ]);

  const qc = {
    getQueryData: (key: unknown[]) => data.get(JSON.stringify(key)),
    setQueryData: (key: unknown[], updater: unknown) => {
      const k = JSON.stringify(key);
      const prev = data.get(k);
      const next = typeof updater === "function" ? (updater as (p: unknown) => unknown)(prev) : updater;
      data.set(k, next);
      return next;
    },
    invalidateQueries: vi.fn(async () => undefined),
    getQueryCache: () => ({
      subscribe: () => () => undefined,
    }),
  };

  return { qc: qc as unknown as Parameters<typeof startWidgetSyncService>[0], data };
}

const sampleList: TodoList = {
  id: "list-pinned",
  name: "Errands",
  ownerId: "u-1",
  createdAt: 1000,
  shareMode: "private",
  isOwner: true,
  canEdit: true,
};

const sampleTodos: TodoItem[] = [
  {
    id: "p-1",
    listId: "list-pinned",
    text: "Buy milk",
    completed: false,
    priority: "none",
    recurrence: "none",
    reminderSent: false,
    createdAt: 2000,
  },
  {
    id: "p-2",
    listId: "list-pinned",
    text: "Mail package",
    completed: false,
    priority: "none",
    recurrence: "none",
    reminderSent: false,
    createdAt: 1000,
  },
];

describe("mobile widgetSync replay & undo window timing (#254)", () => {
  const baseTime = 1_700_000_000_000;

  beforeEach(() => {
    mocks.widgetSnapshots.clear();
    mocks.interactionListeners.clear();
    mocks.appStateListeners.clear();
    mocks.reactNative.AppState.currentState = "background";
    vi.clearAllMocks();
    mocks.apiClient.post.mockReset();
    const initialSnap = buildListWidgetSnapshot(sampleList, sampleTodos, {
      now: baseTime,
      sortMode: "created",
    });
    pinnedListWidgetHandle.updateSnapshot(initialSnap);
    currentListWidgetHandle.updateSnapshot({
      ...initialSnap,
      listId: "",
      isLoggedIn: false,
      tasks: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clearing handled ops keeps taps made while the replay request is in flight", async () => {
    simulateNativeWidgetTap("complete:p-1", baseTime + 100);

    let resolveFirstPost!: (value: unknown) => void;
    mocks.apiClient.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstPost = resolve;
        })
    );

    const drainPromise = drainAndReplayPendingWidgetOps(undefined, { flushPendingUndo: true });
    // Flush microtasks so the initial read has completed and p-1's POST is awaiting resolution.
    await Promise.resolve();
    expect(mocks.apiClient.post).toHaveBeenCalledTimes(1);

    // While p-1 replay is in-flight, user taps p-2 on the widget (>800ms later).
    simulateNativeWidgetTap("complete:p-2", baseTime + 1_100);

    resolveFirstPost({
      data: { success: true, todo: { ...sampleTodos[0], completed: true } },
    });
    await drainPromise;

    const after = getPinnedSnapshot();
    // p-1 was handled and cleared; p-2 was tapped during replay and stays queued for retry!
    expect(after.pendingOps.map((o) => o.todoId)).toEqual(["p-2"]);
    expect(after.tasks.find((t) => t.id === "p-2")).toMatchObject({
      id: "p-2",
      completed: true,
      pendingCompletedAt: baseTime + 1_100,
    });
  });

  it("holds home-screen check-offs for the ~10s undo window and reconciles undo to completed:false", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const { qc } = createFakeQueryClient(sampleList, sampleTodos);
    mocks.apiClient.post.mockResolvedValue({
      data: { success: true, todo: { ...sampleTodos[0], completed: false } },
    });

    const stop = startWidgetSyncService(qc);
    try {
      // Launch drain resolves immediately since queue starts empty.
      await vi.advanceTimersByTimeAsync(10);
      mocks.apiClient.post.mockClear();

      // Re-seed snapshot (as startWidgetSyncService wrote it) and tap p-1 on the home screen.
      simulateNativeWidgetTap("complete:p-1", baseTime + 500);
      for (const listener of mocks.interactionListeners) {
        listener({ source: "PinnedListWidget", target: "complete:p-1", timestamp: baseTime + 500 });
      }
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mocks.apiClient.post).not.toHaveBeenCalled();

      // Tap Undo inside the 10-second window.
      simulateNativeWidgetTap("undo:p-1", baseTime + 2_500);
      for (const listener of mocks.interactionListeners) {
        listener({ source: "PinnedListWidget", target: "undo:p-1", timestamp: baseTime + 2_500 });
      }
      await vi.advanceTimersByTimeAsync(50);

      expect(mocks.apiClient.post).toHaveBeenCalledTimes(1);
      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/api/v1/todos/p-1/completed",
        expect.objectContaining({ completed: false, source: "widget" })
      );
    } finally {
      stop();
    }
  });

  it("flushes pending check-offs immediately when opening the app instead of waiting 10s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const { qc } = createFakeQueryClient(sampleList, sampleTodos);
    mocks.apiClient.post.mockResolvedValue({
      data: { success: true, todo: { ...sampleTodos[0], completed: true } },
    });

    const stop = startWidgetSyncService(qc);
    try {
      await vi.advanceTimersByTimeAsync(10);
      mocks.apiClient.post.mockClear();

      simulateNativeWidgetTap("complete:p-1", baseTime + 500);
      for (const listener of mocks.interactionListeners) {
        listener({ source: "PinnedListWidget", target: "complete:p-1", timestamp: baseTime + 500 });
      }
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.apiClient.post).not.toHaveBeenCalled();

      // User opens the app before 10 seconds elapse.
      mocks.reactNative.AppState.currentState = "active";
      for (const cb of mocks.appStateListeners) {
        cb("active");
      }
      await vi.advanceTimersByTimeAsync(50);

      expect(mocks.apiClient.post).toHaveBeenCalledTimes(1);
      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/api/v1/todos/p-1/completed",
        expect.objectContaining({
          completed: true,
          completedAt: baseTime + 500,
          source: "widget",
        })
      );

      // Pinned widget now has p-1 flushed without waiting the remaining ~9s.
      const finalSnap = getPinnedSnapshot();
      expect(finalSnap.pendingOps).toEqual([]);
      expect(finalSnap.tasks.map((t) => t.id)).toEqual(["p-2"]);
    } finally {
      stop();
    }
  });

  it("auto-drains pending check-offs once the 10s undo window timer elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const { qc } = createFakeQueryClient(sampleList, sampleTodos);
    mocks.apiClient.post.mockResolvedValue({
      data: { success: true, todo: { ...sampleTodos[0], completed: true } },
    });

    const stop = startWidgetSyncService(qc);
    try {
      await vi.advanceTimersByTimeAsync(10);
      mocks.apiClient.post.mockClear();

      simulateNativeWidgetTap("complete:p-1", baseTime + 100);
      for (const listener of mocks.interactionListeners) {
        listener({ source: "PinnedListWidget", target: "complete:p-1", timestamp: baseTime + 100 });
      }

      await vi.advanceTimersByTimeAsync(WIDGET_UNDO_WINDOW_MS - 100);
      expect(mocks.apiClient.post).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(150);
      expect(mocks.apiClient.post).toHaveBeenCalledTimes(1);
      const finalSnap = getPinnedSnapshot();
      expect(finalSnap.tasks.map((t) => t.id)).toEqual(["p-2"]);
    } finally {
      stop();
    }
  });
});
