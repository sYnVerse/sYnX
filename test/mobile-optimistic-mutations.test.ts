import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const harness = vi.hoisted(() => {
  (globalThis as unknown as { __DEV__?: boolean }).__DEV__ = false;
  type HookState = {
    hooks: any[];
    effects: { deps?: any[]; cleanup?: () => void; fn: () => void | (() => void) }[];
  };
  const instances = new Map<string, HookState>();
  const mountedPaths = new Set<string>();
  let currentPath = "";
  let hookIdx = 0;
  let pendingEffects: { path: string; idx: number }[] = [];
  let rootRenderFn: (() => void) | null = null;

  const isSameDeps = (a?: any[], b?: any[]) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  };

  function getInstance(path: string): HookState {
    let inst = instances.get(path);
    if (!inst) {
      inst = { hooks: [], effects: [] };
      instances.set(path, inst);
    }
    return inst;
  }

  function scheduleRender() {
    if (rootRenderFn) rootRenderFn();
  }

  const ContextStack = new Map<symbol, any[]>();

  function createContext<T>(defaultValue: T) {
    const id = Symbol("Context");
    const Provider = ({ value, children }: { value: T; children?: any }) => ({
      $$typeof: Symbol.for("react.context.provider"),
      id,
      value,
      children,
    });
    return { id, _currentValue: defaultValue, Provider };
  }

  function useContext<T>(ctx: any): T {
    const stack = ContextStack.get(ctx.id);
    if (stack && stack.length > 0) return stack[stack.length - 1];
    return ctx._currentValue;
  }

  function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
    const path = currentPath;
    const idx = hookIdx++;
    const inst = getInstance(path);
    if (!(idx in inst.hooks)) {
      inst.hooks[idx] = typeof initial === "function" ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((prev: T) => T)) => {
      const prev = inst.hooks[idx];
      const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      if (!Object.is(prev, val)) {
        inst.hooks[idx] = val;
        scheduleRender();
      }
    };
    return [inst.hooks[idx], setState];
  }

  function useRef<T>(initial: T): { current: T } {
    const idx = hookIdx++;
    const inst = getInstance(currentPath);
    if (!(idx in inst.hooks)) {
      inst.hooks[idx] = { current: initial };
    }
    return inst.hooks[idx];
  }

  function hookUseMemo<T>(factory: () => T, deps?: any[]): T {
    const idx = hookIdx++;
    const inst = getInstance(currentPath);
    const prev = inst.hooks[idx];
    if (!prev || !isSameDeps(prev.deps, deps)) {
      const value = factory();
      inst.hooks[idx] = { value, deps };
      return value;
    }
    return prev.value;
  }

  function useCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T {
    return hookUseMemo(() => fn, deps);
  }

  function useEffect(fn: () => void | (() => void), deps?: any[]) {
    const path = currentPath;
    const idx = hookIdx++;
    const inst = getInstance(path);
    const prev = inst.hooks[idx];
    if (!prev || !deps || !isSameDeps(prev.deps, deps)) {
      inst.hooks[idx] = { deps };
      inst.effects[idx] = { deps, cleanup: prev?.cleanup, fn };
      pendingEffects.push({ path, idx });
    }
  }

  function useSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T
  ): T {
    const [, forceUpdate] = useState(0);
    const snap = getSnapshot();
    useEffect(() => {
      return subscribe(() => forceUpdate((n) => n + 1));
    }, [subscribe]);
    return snap;
  }

  const Fragment = Symbol.for("react.fragment");

  function createElement(type: any, props: any, ...children: any[]) {
    const flatChildren =
      children.length === 0 ? props?.children : children.length === 1 ? children[0] : children;
    return {
      $$typeof: Symbol.for("react.transitional.element"),
      type,
      key: props?.key ?? null,
      props: { ...(props || {}), children: flatChildren },
    };
  }

  function jsx(type: any, props: any, key?: any) {
    return {
      $$typeof: Symbol.for("react.transitional.element"),
      type,
      key: key ?? null,
      props: props || {},
    };
  }

  const reactMock = {
    default: null as any,
    Fragment,
    createContext,
    useContext,
    useState,
    useRef,
    useMemo: hookUseMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    useSyncExternalStore,
    createElement,
  };
  reactMock.default = reactMock;

  const jsxRuntimeMock = { Fragment, jsx, jsxs: jsx, jsxDEV: jsx };

  function renderNode(node: any, path: string, nextMounted: Set<string>): any {
    if (node == null || typeof node === "boolean") return null;
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) {
      return node.map((child, i) => {
        const keyPart =
          child && typeof child === "object" && child.key != null ? `k:${child.key}` : `i:${i}`;
        return renderNode(child, `${path}/${keyPart}`, nextMounted);
      });
    }
    if (typeof node !== "object") return null;

    if (node.$$typeof === Symbol.for("react.context.provider")) {
      let stack = ContextStack.get(node.id);
      if (!stack) {
        stack = [];
        ContextStack.set(node.id, stack);
      }
      stack.push(node.value);
      try {
        return renderNode(node.children, `${path}/ctx`, nextMounted);
      } finally {
        stack.pop();
      }
    }

    if (node.type === Fragment) {
      return renderNode(node.props?.children, `${path}/frag`, nextMounted);
    }

    if (typeof node.type === "function") {
      const compName = node.type.name || "Fn";
      const compPath = `${path}/${compName}${node.key != null ? `#${node.key}` : ""}`;
      nextMounted.add(compPath);
      const prevPath = currentPath;
      const prevIdx = hookIdx;
      currentPath = compPath;
      hookIdx = 0;
      let out: any;
      try {
        out = node.type(node.props || {});
      } finally {
        currentPath = prevPath;
        hookIdx = prevIdx;
      }
      return {
        kind: "component",
        name: compName,
        props: node.props,
        child: renderNode(out, compPath, nextMounted),
      };
    }

    const hostName = typeof node.type === "string" ? node.type : "Host";
    return {
      kind: "host",
      type: hostName,
      props: node.props || {},
      children: renderNode(node.props?.children, `${path}/${hostName}`, nextMounted),
    };
  }

  function flushEffects() {
    for (let guard = 0; guard < 15 && pendingEffects.length > 0; guard++) {
      const batch = pendingEffects.splice(0, pendingEffects.length);
      for (const { path, idx } of batch) {
        const inst = instances.get(path);
        const eff = inst?.effects[idx];
        if (!eff) continue;
        if (typeof eff.cleanup === "function") eff.cleanup();
        const cleanup = eff.fn();
        eff.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
    }
  }

  function unmountMissing(nextMounted: Set<string>) {
    for (const path of Array.from(mountedPaths)) {
      if (!nextMounted.has(path)) {
        const inst = instances.get(path);
        if (inst) {
          for (const eff of inst.effects) {
            if (eff?.cleanup) eff.cleanup();
          }
          instances.delete(path);
        }
        mountedPaths.delete(path);
      }
    }
    for (const p of nextMounted) mountedPaths.add(p);
  }

  function mount(elementFactory: () => any) {
    let rendering = false;
    let rerenderQueued = false;
    const render = () => {
      if (rendering) {
        rerenderQueued = true;
        return;
      }
      rendering = true;
      try {
        do {
          rerenderQueued = false;
          const nextMounted = new Set<string>();
          renderNode(elementFactory(), "root", nextMounted);
          unmountMissing(nextMounted);
          flushEffects();
        } while (rerenderQueued);
      } finally {
        rendering = false;
      }
    };
    rootRenderFn = render;
    render();
  }

  function resetTree() {
    for (const inst of instances.values()) {
      for (const eff of inst.effects) {
        if (eff?.cleanup) eff.cleanup();
      }
    }
    instances.clear();
    mountedPaths.clear();
    pendingEffects = [];
    rootRenderFn = null;
  }

  return { reactMock, jsxRuntimeMock, mount, resetTree };
});

const mocks = vi.hoisted(() => {
  const showError = vi.fn();
  const showSuccess = vi.fn();
  const showToast = vi.fn();

  return {
    reactNative: {
      Platform: { OS: "android" },
    },
    haptics: {
      impactAsync: vi.fn(async () => {}),
      notificationAsync: vi.fn(async () => {}),
      ImpactFeedbackStyle: { Light: "light" },
      NotificationFeedbackType: { Success: "success", Error: "error" },
    },
    apiClient: {
      get: vi.fn<(...args: any[]) => any>(),
      post: vi.fn<(...args: any[]) => any>(),
      put: vi.fn<(...args: any[]) => any>(),
      delete: vi.fn<(...args: any[]) => any>(),
    },
    calendar: {
      syncTaskToNativeCalendar: vi.fn(async () => null),
      removeTaskFromNativeCalendar: vi.fn(async () => {}),
    },
    showError,
    showSuccess,
    showToast,
  };
});

vi.mock("react", () => harness.reactMock);
vi.mock("../mobile/node_modules/react", () => harness.reactMock);
vi.mock("../mobile/node_modules/react/index.js", () => harness.reactMock);
vi.mock("../node_modules/react/index.js", () => harness.reactMock);
vi.mock("react/jsx-runtime", () => harness.jsxRuntimeMock);
vi.mock("../mobile/node_modules/react/jsx-runtime", () => harness.jsxRuntimeMock);
vi.mock("../mobile/node_modules/react/jsx-runtime.js", () => harness.jsxRuntimeMock);
vi.mock("../node_modules/react/jsx-runtime.js", () => harness.jsxRuntimeMock);
vi.mock("react/jsx-dev-runtime", () => harness.jsxRuntimeMock);
vi.mock("../mobile/node_modules/react/jsx-dev-runtime", () => harness.jsxRuntimeMock);
vi.mock("../mobile/node_modules/react/jsx-dev-runtime.js", () => harness.jsxRuntimeMock);
vi.mock("../node_modules/react/jsx-dev-runtime.js", () => harness.jsxRuntimeMock);
vi.mock("react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native/index.js", () => mocks.reactNative);
vi.mock("expo-haptics", () => mocks.haptics);
vi.mock("../mobile/node_modules/expo-haptics", () => mocks.haptics);
vi.mock("../mobile/node_modules/expo-haptics/build/Haptics.js", () => mocks.haptics);
vi.mock("../mobile/src/api/client", () => ({
  apiClient: mocks.apiClient,
}));
vi.mock("../mobile/src/services/calendar", () => mocks.calendar);
vi.mock("../mobile/src/context/ThemeContext", () => ({
  useTheme: () => ({ hapticsEnabled: true }),
}));
vi.mock("../mobile/src/context/ToastContext", () => ({
  useToast: () => ({
    showError: mocks.showError,
    showSuccess: mocks.showSuccess,
    showToast: mocks.showToast,
  }),
}));

import {
  QueryClient,
  QueryClientProvider,
} from "../mobile/node_modules/@tanstack/react-query/build/modern/index.js";
import {
  SLOW_MUTATION_THRESHOLD_MS,
  useSetTodoCompleted,
} from "../mobile/src/hooks/useSetTodoCompleted";
import { useTaskMutations } from "../mobile/src/hooks/useTaskMutations";
import type { TodoItem } from "../shared";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("mobile optimistic update safeguards (#170)", () => {
  let queryClient: QueryClient;

  const baseTask: TodoItem = {
    id: "todo-1",
    listId: "list-1",
    text: "Buy milk",
    completed: false,
    priority: "low",
    recurrence: "none",
    reminderAt: 1_800_000_000_000,
    reminderSent: false,
    createdAt: 1000,
  };

  const siblingTask: TodoItem = {
    id: "todo-2",
    listId: "list-1",
    text: "Sibling task",
    completed: true,
    priority: "none",
    recurrence: "none",
    reminderSent: false,
    createdAt: 1001,
  };

  beforeEach(() => {
    harness.resetTree();
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["lists", "all"], [{ id: "list-1", name: "Personal" }]);
    queryClient.setQueryData(["todos", "list-1"], [baseTask, siblingTask]);
  });

  afterEach(() => {
    harness.resetTree();
    vi.useRealTimers();
  });

  function mountCompletedHook(listId = "list-1") {
    let api!: ReturnType<typeof useSetTodoCompleted>;
    const Probe = () => {
      api = useSetTodoCompleted(listId);
      return null;
    };
    harness.mount(() =>
      harness.reactMock.createElement(
        QueryClientProvider,
        { client: queryClient },
        harness.reactMock.createElement(Probe, null)
      )
    );
    return () => api;
  }

  function mountTaskMutationsHook(listId = "list-1") {
    let api!: ReturnType<typeof useTaskMutations>;
    const Probe = () => {
      api = useTaskMutations(listId);
      return null;
    };
    harness.mount(() =>
      harness.reactMock.createElement(
        QueryClientProvider,
        { client: queryClient },
        harness.reactMock.createElement(Probe, null)
      )
    );
    return () => api;
  }

  it("rolls back failed setCompleted without clobbering siblings, restores native calendar, and shows undo error", async () => {
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post.mockImplementationOnce(() => d1.promise);

    const getHook = mountCompletedHook();
    getHook().setCompleted(baseTask, true);
    await flushAsync();

    // Optimistically updated before server responds
    const during = queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])!;
    expect(during.find((t) => t.id === "todo-1")?.completed).toBe(true);
    expect(getHook().isPendingId("todo-1")).toBe(true);

    d1.reject({ response: { data: { error: "D1 write failed" } } });
    await flushAsync();

    const after = queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])!;
    expect(after.find((t) => t.id === "todo-1")?.completed).toBe(false);
    expect(after.find((t) => t.id === "todo-2")?.completed).toBe(true);
    expect(getHook().isPendingId("todo-1")).toBe(false);

    expect(mocks.calendar.syncTaskToNativeCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", completed: false }),
      { listName: "Personal" }
    );
    expect(mocks.showError).toHaveBeenCalledWith("Couldn't save, change undone: D1 write failed");
  });

  it("handles out-of-order check/uncheck responses so the last intended state wins", async () => {
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    const d2 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    const getHook = mountCompletedHook();

    // Rapid check then uncheck before first response arrives
    getHook().setCompleted(baseTask, true);
    getHook().setCompleted(baseTask, false);
    await flushAsync();

    expect(mocks.apiClient.post).toHaveBeenCalledTimes(2);
    expect(mocks.apiClient.post).toHaveBeenNthCalledWith(1, "/api/v1/todos/todo-1/completed", {
      completed: true,
    });
    expect(mocks.apiClient.post).toHaveBeenNthCalledWith(2, "/api/v1/todos/todo-1/completed", {
      completed: false,
    });
    expect(
      queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])?.find((t) => t.id === "todo-1")
        ?.completed
    ).toBe(false);

    // Second request finishes first, then stale first request arrives
    d2.resolve({ data: { todo: { ...baseTask, completed: false }, rescheduled: false } });
    await flushAsync();
    expect(getHook().isPendingId("todo-1")).toBe(false);

    d1.resolve({ data: { todo: { ...baseTask, completed: true }, rescheduled: false } });
    await flushAsync();

    const finalTask = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-1");
    expect(finalTask?.completed).toBe(false);
    expect(mocks.calendar.syncTaskToNativeCalendar).toHaveBeenCalledTimes(1);
    expect(mocks.calendar.syncTaskToNativeCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", completed: false }),
      { listName: "Personal" }
    );
  });

  it("ignores stale earlier failure when superseded by a newer toggle", async () => {
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    const d2 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    const getHook = mountCompletedHook();
    getHook().setCompleted(baseTask, true);
    getHook().setCompleted(baseTask, false);
    await flushAsync();

    d1.reject(new Error("Timed out"));
    await flushAsync();
    // Stale request error should not flash an undo toast or clear pending state for #2
    expect(mocks.showError).not.toHaveBeenCalled();
    expect(getHook().isPendingId("todo-1")).toBe(true);

    d2.resolve({ data: { todo: { ...baseTask, completed: false }, rescheduled: false } });
    await flushAsync();
    expect(getHook().isPendingId("todo-1")).toBe(false);
    expect(
      queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])?.find((t) => t.id === "todo-1")
        ?.completed
    ).toBe(false);
  });

  it("suppresses duplicate same-value submissions while in flight", async () => {
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post.mockImplementationOnce(() => d1.promise);

    const getHook = mountCompletedHook();
    getHook().setCompleted(baseTask, true);
    getHook().setCompleted(baseTask, true);
    // Also calling without explicit arg while un-rerendered stale task still has completed=false computes desired=true
    getHook().setCompleted(baseTask);
    await flushAsync();

    expect(mocks.apiClient.post).toHaveBeenCalledTimes(1);

    d1.resolve({ data: { todo: { ...baseTask, completed: true }, rescheduled: false } });
    await flushAsync();

    // Already completed one-time task with explicit completed=true is idempotently ignored
    getHook().setCompleted({ ...baseTask, completed: true }, true);
    expect(mocks.apiClient.post).toHaveBeenCalledTimes(1);
  });

  it("optimistically advances recurring task reminderAt and reconciles to server reminder date", async () => {
    const recurringTask: TodoItem = {
      ...baseTask,
      id: "todo-rec",
      recurrence: "daily",
      reminderAt: 1_800_000_000_000,
    };
    queryClient.setQueryData(["todos", "list-1"], [recurringTask]);

    const serverNextReminder = 1_800_090_000_000;
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post.mockImplementationOnce(() => d1.promise);

    const getHook = mountCompletedHook();
    getHook().setCompleted(recurringTask, true);
    await flushAsync();

    const optimistic = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-rec");
    expect(optimistic?.completed).toBe(false);
    expect(optimistic?.reminderAt).toBeGreaterThan(recurringTask.reminderAt!);

    d1.resolve({
      data: {
        todo: { ...recurringTask, completed: false, reminderAt: serverNextReminder, reminderSent: false },
        rescheduled: true,
      },
    });
    await flushAsync();

    const reconciled = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-rec");
    expect(reconciled?.reminderAt).toBe(serverNextReminder);
    expect(mocks.showSuccess).toHaveBeenCalledTimes(1);
  });

  it("flags isSlowPendingId after 10 seconds and clears it when settled", async () => {
    vi.useFakeTimers();
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post.mockImplementationOnce(() => d1.promise);

    const getHook = mountCompletedHook();
    getHook().setCompleted(baseTask, true);
    await vi.advanceTimersByTimeAsync(0);

    expect(getHook().isPendingId("todo-1")).toBe(true);
    expect(getHook().isSlowPendingId("todo-1")).toBe(false);

    await vi.advanceTimersByTimeAsync(SLOW_MUTATION_THRESHOLD_MS - 1);
    expect(getHook().isSlowPendingId("todo-1")).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(getHook().isSlowPendingId("todo-1")).toBe(true);

    d1.resolve({ data: { todo: { ...baseTask, completed: true }, rescheduled: false } });
    await vi.advanceTimersByTimeAsync(0);

    expect(getHook().isPendingId("todo-1")).toBe(false);
    expect(getHook().isSlowPendingId("todo-1")).toBe(false);
  });

  it("useTaskMutations updateMutation optimistically patches, rolls back + restores calendar on error, and drops stale responses", async () => {
    const getMutations = mountTaskMutationsHook();

    // 1) Failure rolls back cache + native calendar and shows undo toast
    const errDeferred = createDeferred<{ data: { todo: TodoItem } }>();
    mocks.apiClient.put.mockImplementationOnce(() => errDeferred.promise);

    const mutatePromise = getMutations()
      .updateMutation.mutateAsync({
        id: "todo-1",
        payload: { text: "Buy oat milk", priority: "high", reminderAt: null },
      })
      .catch(() => {});

    await flushAsync();
    const optimistic = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-1");
    expect(optimistic?.text).toBe("Buy oat milk");
    expect(optimistic?.priority).toBe("high");
    expect(optimistic?.reminderAt).toBeUndefined();

    errDeferred.reject({ response: { data: { error: "Conflict" } } });
    await mutatePromise;
    await flushAsync();

    const rolledBack = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-1");
    expect(rolledBack?.text).toBe("Buy milk");
    expect(rolledBack?.priority).toBe("low");
    expect(rolledBack?.reminderAt).toBe(1_800_000_000_000);
    expect(mocks.calendar.syncTaskToNativeCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", text: "Buy milk", reminderAt: 1_800_000_000_000 }),
      { listName: "Personal" }
    );
    expect(mocks.showError).toHaveBeenCalledWith("Couldn't save, change undone: Conflict");

    // 2) Rolling back an unscheduled task removes any synced native calendar event
    vi.clearAllMocks();
    const unscheduledErr = createDeferred<{ data: { todo: TodoItem } }>();
    mocks.apiClient.put.mockImplementationOnce(() => unscheduledErr.promise);
    const p2 = getMutations()
      .updateMutation.mutateAsync({
        id: "todo-2",
        payload: { reminderAt: 1_900_000_000_000 },
      })
      .catch(() => {});
    await flushAsync();
    unscheduledErr.reject(new Error("Offline"));
    await p2;
    await flushAsync();
    expect(mocks.calendar.removeTaskFromNativeCalendar).toHaveBeenCalledWith("todo-2");

    // 3) Out-of-order responses keep last intended edit
    vi.clearAllMocks();
    const dFirst = createDeferred<{ data: { todo: TodoItem } }>();
    const dSecond = createDeferred<{ data: { todo: TodoItem } }>();
    mocks.apiClient.put
      .mockImplementationOnce(() => dFirst.promise)
      .mockImplementationOnce(() => dSecond.promise);

    const pFirst = getMutations().updateMutation.mutateAsync({
      id: "todo-1",
      payload: { text: "Draft 1", priority: "medium" },
    });
    const pSecond = getMutations().updateMutation.mutateAsync({
      id: "todo-1",
      payload: { text: "Draft 2", priority: "high" },
    });
    await flushAsync();

    dSecond.resolve({
      data: { todo: { ...baseTask, text: "Draft 2", priority: "high" } },
    });
    await pSecond;
    await flushAsync();

    dFirst.resolve({
      data: { todo: { ...baseTask, text: "Draft 1", priority: "medium" } },
    });
    await pFirst;
    await flushAsync();

    const finalTask = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-1");
    expect(finalTask?.text).toBe("Draft 2");
    expect(finalTask?.priority).toBe("high");
  });

  it("earlier request succeeds, later request fails: rolls back to confirmed server state, preserves baseline while earlier request is in flight, and reconciles", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const getHook = mountCompletedHook();

    // Case 1: seq 1 (check) succeeds first, then seq 2 (uncheck) fails
    const d1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    const d2 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    getHook().setCompleted(baseTask, true);
    getHook().setCompleted(baseTask, false);
    await flushAsync();

    d1.resolve({ data: { todo: { ...baseTask, completed: true }, rescheduled: false } });
    await flushAsync();
    // Stale optimistic UI still shows seq 2's unchecked value until seq 2 settles
    expect(
      queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])?.find((t) => t.id === "todo-1")
        ?.completed
    ).toBe(false);

    d2.reject({ response: { data: { error: "Conflict" } } });
    await flushAsync();

    // Rollback must restore seq 1's server-confirmed completed=true (not pre-burst false)
    const afterRollback = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-1");
    expect(afterRollback?.completed).toBe(true);
    expect(mocks.calendar.syncTaskToNativeCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", completed: true }),
      { listName: "Personal" }
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "list-1"] });

    // Case 2: seq 2 settles BEFORE seq 1; seq 3 started afterward still keeps a valid baseline
    vi.clearAllMocks();
    queryClient.setQueryData(["todos", "list-1"], [{ ...baseTask, completed: false }]);
    const s1 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    const s2 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    const s3 = createDeferred<{ data: { todo: TodoItem; rescheduled: boolean } }>();
    mocks.apiClient.post
      .mockImplementationOnce(() => s1.promise)
      .mockImplementationOnce(() => s2.promise)
      .mockImplementationOnce(() => s3.promise);

    getHook().setCompleted(baseTask, true); // seq 1
    getHook().setCompleted(baseTask, false); // seq 2
    await flushAsync();

    // seq 2 settles first while seq 1 is still in flight
    s2.reject(new Error("Temporary error"));
    await flushAsync();

    // Now seq 3 starts while seq 1 is still in flight, then fails -> must still restore baseline (false)
    getHook().setCompleted(baseTask, true); // seq 3
    await flushAsync();
    expect(
      queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])?.find((t) => t.id === "todo-1")
        ?.completed
    ).toBe(true);

    s3.reject(new Error("Failed again"));
    await flushAsync();
    expect(
      queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])?.find((t) => t.id === "todo-1")
        ?.completed
    ).toBe(false);

    s1.resolve({ data: { todo: { ...baseTask, completed: true }, rescheduled: false } });
    await flushAsync();
  });

  it("useTaskMutations updateMutation restores seq 1 server state when seq 1 succeeds before seq 2 fails", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const getMutations = mountTaskMutationsHook();

    const u1 = createDeferred<{ data: { todo: TodoItem } }>();
    const u2 = createDeferred<{ data: { todo: TodoItem } }>();
    mocks.apiClient.put
      .mockImplementationOnce(() => u1.promise)
      .mockImplementationOnce(() => u2.promise);

    const p1 = getMutations()
      .updateMutation.mutateAsync({ id: "todo-1", payload: { text: "Confirmed Draft", priority: "medium" } })
      .catch(() => {});
    const p2 = getMutations()
      .updateMutation.mutateAsync({ id: "todo-1", payload: { text: "Rejected Draft", priority: "high" } })
      .catch(() => {});
    await flushAsync();

    u1.resolve({
      data: { todo: { ...baseTask, text: "Confirmed Draft", priority: "medium" } },
    });
    await p1;
    await flushAsync();

    u2.reject({ response: { data: { error: "Conflict" } } });
    await p2;
    await flushAsync();

    const finalTask = queryClient
      .getQueryData<TodoItem[]>(["todos", "list-1"])
      ?.find((t) => t.id === "todo-1");
    expect(finalTask?.text).toBe("Confirmed Draft");
    expect(finalTask?.priority).toBe("medium");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "list-1"] });
  });
});
