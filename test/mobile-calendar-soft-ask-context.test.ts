import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercises PushPromptProvider + CalendarAccessSoftAsk against real TanStack
// Query cache and shared calendar soft-ask policy rules (#134).

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
  let currentTree: any = null;

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

  function useReducer<S, A>(reducer: (s: S, a: A) => S, initialArg: S, init?: (a: S) => S): [S, (a: A) => void] {
    const [state, setState] = useState<S>(() => (init ? init(initialArg) : initialArg));
    const dispatch = (action: A) => setState((prev) => reducer(prev, action));
    return [state, dispatch];
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
    const flatChildren = children.length === 0 ? props?.children : children.length === 1 ? children[0] : children;
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
    useReducer,
    useRef,
    useMemo: hookUseMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    useSyncExternalStore,
    createElement,
    cloneElement: (el: any, props: any, ...children: any[]) =>
      createElement(el.type, { ...el.props, ...props }, ...children),
    isValidElement: (v: any) => Boolean(v && typeof v === "object" && v.$$typeof),
    Children: {
      toArray: (c: any) => (Array.isArray(c) ? c.flat() : c == null ? [] : [c]),
    },
  };
  reactMock.default = reactMock;

  const jsxRuntimeMock = { Fragment, jsx, jsxs: jsx, jsxDEV: jsx };

  function renderNode(node: any, path: string, nextMounted: Set<string>): any {
    if (node == null || typeof node === "boolean") return null;
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) {
      return node.map((child, i) => {
        const keyPart = child && typeof child === "object" && child.key != null ? `k:${child.key}` : `i:${i}`;
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

    const hostName = typeof node.type === "string" ? node.type : node.type?.displayName || "Host";
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
        if (typeof eff.cleanup === "function") {
          eff.cleanup();
        }
        const cleanup = eff.fn();
        eff.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        if (inst.hooks[idx]) {
          inst.hooks[idx].cleanup = eff.cleanup;
        }
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
          currentTree = renderNode(elementFactory(), "root", nextMounted);
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
    currentTree = null;
  }

  function findAll(predicate: (node: any) => boolean, node: any = currentTree, acc: any[] = []): any[] {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const item of node) findAll(predicate, item, acc);
      return acc;
    }
    if (predicate(node)) acc.push(node);
    if (node.child) findAll(predicate, node.child, acc);
    if (node.children) findAll(predicate, node.children, acc);
    return acc;
  }

  return { reactMock, jsxRuntimeMock, mount, resetTree, findAll };
});

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const appStateListeners: ((next: string) => void)[] = [];
  let nowMs = 1_700_000_000_000;

  const calState = {
    syncEnabled: true,
    permissionGranted: false,
    canAskAgain: true,
    declinedAt: null as number | null,
    openSettingsShouldGrantLater: false,
  };

  const makeComp = (name: string) => {
    const C = ({ children, ...props }: any) => harness.reactMock.createElement(name, props, children);
    (C as any).displayName = name;
    return C;
  };

  const reactNative = {
    Platform: { OS: "android" },
    AppState: {
      currentState: "active",
      addEventListener: vi.fn((event: string, cb: (next: string) => void) => {
        if (event === "change") appStateListeners.push(cb);
        return {
          remove: vi.fn(() => {
            const idx = appStateListeners.indexOf(cb);
            if (idx >= 0) appStateListeners.splice(idx, 1);
          }),
        };
      }),
    },
    Appearance: {
      getColorScheme: vi.fn(() => "dark"),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    useColorScheme: vi.fn(() => "dark"),
    View: makeComp("View"),
    Text: makeComp("Text"),
    TouchableOpacity: makeComp("TouchableOpacity"),
    Modal: ({ visible, children, ...props }: any) =>
      visible ? harness.reactMock.createElement("Modal", { visible, ...props }, children) : null,
    StyleSheet: { create: (s: any) => s },
    Dimensions: { get: () => ({ width: 400, height: 800 }) },
  };

  const asyncStorage = {
    default: {
      getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        storage.set(k, v);
      }),
      removeItem: vi.fn(async (k: string) => {
        storage.delete(k);
      }),
    },
  };

  const hapticsMod = {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
    ImpactFeedbackStyle: { Light: "light" },
    NotificationFeedbackType: { Success: "success", Error: "error" },
  };

  const iconsMod = {
    Calendar: () => harness.reactMock.createElement("Calendar", {}),
  };

  const calendarService = {
    isCalendarSyncEnabled: vi.fn(async () => calState.syncEnabled),
    checkCalendarPermissions: vi.fn(async () => ({
      granted: calState.permissionGranted,
      canAskAgain: calState.canAskAgain,
      status: calState.permissionGranted ? "granted" : "denied",
    })),
    clearCalendarSoftAskDeclined: vi.fn(async () => {
      calState.declinedAt = null;
    }),
    markCalendarSoftAskDeclined: vi.fn(async () => {
      calState.declinedAt = nowMs;
    }),
    shouldShowCalendarSoftAsk: vi.fn(async () => {
      if (!calState.syncEnabled || calState.permissionGranted) return false;
      if (calState.declinedAt != null && nowMs - calState.declinedAt < 7 * 24 * 60 * 60 * 1000) {
        return false;
      }
      return true;
    }),
    enableCalendarAccessFromPrompt: vi.fn(async () => {
      if (calState.permissionGranted) {
        calState.declinedAt = null;
        return { granted: true, openedSettings: false };
      }
      if (calState.canAskAgain) {
        // Simulated OS dialog grant vs deny
        if (calState.openSettingsShouldGrantLater) {
          calState.permissionGranted = true;
          calState.declinedAt = null;
          return { granted: true, openedSettings: false };
        }
        return { granted: false, openedSettings: false };
      }
      return { granted: false, openedSettings: true };
    }),
    turnOffCalendarSyncFromPrompt: vi.fn(async () => {
      calState.syncEnabled = false;
    }),
    syncAllTasksToNativeCalendar: vi.fn(async () => {}),
  };

  return {
    storage,
    appStateListeners,
    calState,
    reactNative,
    asyncStorage,
    hapticsMod,
    iconsMod,
    calendarService,
    setNow: (ms: number) => {
      nowMs = ms;
    },
    getNow: () => nowMs,
    triggerAppState: (next: string) => {
      reactNative.AppState.currentState = next;
      for (const cb of [...appStateListeners]) cb(next);
    },
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
vi.mock("@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage/lib/commonjs/index.js", () => mocks.asyncStorage);
vi.mock("expo-haptics", () => mocks.hapticsMod);
vi.mock("../mobile/node_modules/expo-haptics", () => mocks.hapticsMod);
vi.mock("../mobile/node_modules/expo-haptics/build/Haptics.js", () => mocks.hapticsMod);
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("../mobile/node_modules/expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("../mobile/node_modules/expo-status-bar/build/StatusBar.js", () => ({ StatusBar: () => null }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));
vi.mock("../mobile/node_modules/expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));
vi.mock("../mobile/node_modules/expo-secure-store/build/SecureStore.js", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));
vi.mock("lucide-react-native", () => mocks.iconsMod);
vi.mock("../mobile/node_modules/lucide-react-native", () => mocks.iconsMod);
vi.mock("../mobile/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js", () => mocks.iconsMod);
vi.mock("../mobile/src/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  secureSessionStore: { clearSessionTokens: vi.fn(async () => {}) },
}));

vi.mock("../mobile/src/components/NotificationSoftAsk", () => ({
  NotificationSoftAsk: () => null,
}));
vi.mock("../mobile/src/services/notifications", () => ({
  clearSoftAskDeclined: vi.fn(async () => {}),
  getPushPermissionStatus: vi.fn(async () => "granted"),
  markContextualReminderNudgeShown: vi.fn(async () => {}),
  markSoftAskDeclined: vi.fn(async () => {}),
  registerPushTokenIfPermitted: vi.fn(async () => {}),
  requestAndRegisterPush: vi.fn(async () => null),
  shouldShowSoftAsk: vi.fn(async () => false),
}));
vi.mock("../mobile/src/services/calendar", () => mocks.calendarService);

import { QueryClient, QueryClientProvider } from "../mobile/node_modules/@tanstack/react-query/build/modern/index.js";
import { ThemeProvider } from "../mobile/src/context/ThemeContext";
import { PushPromptProvider, isChangelogSettled } from "../mobile/src/context/PushPromptContext";
import { MOBILE_VERSION } from "../mobile/src/constants/changelog";
import type { TodoItem } from "../shared";

async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("PushPromptProvider + CalendarAccessSoftAsk (#134)", () => {
  let queryClient: QueryClient;

  const reminderTask: TodoItem = {
    id: "todo-cal-1",
    listId: "list-1",
    text: "Dentist appointment",
    completed: false,
    priority: "high",
    recurrence: "none",
    reminderAt: 1_800_000_000_000,
    reminderSent: false,
    createdAt: 1000,
  };

  beforeEach(() => {
    harness.resetTree();
    mocks.storage.clear();
    mocks.appStateListeners.length = 0;
    mocks.reactNative.AppState.currentState = "active";
    mocks.setNow(1_700_000_000_000);
    mocks.calState.syncEnabled = true;
    mocks.calState.permissionGranted = false;
    mocks.calState.canAskAgain = true;
    mocks.calState.declinedAt = null;
    mocks.calState.openSettingsShouldGrantLater = false;
    vi.clearAllMocks();

    mocks.storage.set("last_seen_changelog_version", MOBILE_VERSION);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["lists", "all"], [{ id: "list-1", name: "Personal" }]);
    queryClient.setQueryData(["todos", "list-1"], [reminderTask]);
  });

  function mountProvider(enabled = true) {
    harness.mount(() =>
      harness.reactMock.createElement(
        QueryClientProvider,
        { client: queryClient },
        harness.reactMock.createElement(
          ThemeProvider,
          null,
          harness.reactMock.createElement(
            PushPromptProvider,
            { enabled },
            harness.reactMock.createElement("View", { testID: "child" })
          )
        )
      )
    );
  }

  function isModalVisible(): boolean {
    return harness.findAll((n) => n.kind === "host" && n.type === "Modal").length > 0;
  }

  function pressButton(accessibilityLabel: string) {
    const btn = harness.findAll(
      (n) => n.kind === "host" && n.type === "TouchableOpacity" && n.props.accessibilityLabel === accessibilityLabel
    )[0];
    expect(btn).toBeDefined();
    btn.props.onPress();
  }

  it("does not show the calendar prompt when sync is off, access is already granted, or signed out", async () => {
    mocks.calState.syncEnabled = false;
    mountProvider(true);
    await flushAsync();
    expect(isModalVisible()).toBe(false);

    mocks.calState.syncEnabled = true;
    mocks.calState.permissionGranted = true;
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(false);

    mocks.calState.permissionGranted = false;
    mountProvider(false);
    await flushAsync();
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(false);
  });

  it("does not show on foreground while What's New is unsettled, then shows once settled", async () => {
    mocks.storage.delete("last_seen_changelog_version");
    expect(await isChangelogSettled()).toBe(false);

    mountProvider(true);
    await flushAsync(4);

    // Returning from background while What's New is still unsettled must not open the prompt.
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync(4);
    expect(isModalVisible()).toBe(false);

    // Mark What's New as settled and foreground again.
    mocks.storage.set("last_seen_changelog_version", MOBILE_VERSION);
    expect(await isChangelogSettled()).toBe(true);
    mocks.triggerAppState("inactive");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(true);
  });

  it("Turn on prompts for access and syncs cached tasks immediately when granted", async () => {
    mocks.calState.openSettingsShouldGrantLater = true;
    mountProvider(true);
    await flushAsync();
    expect(isModalVisible()).toBe(true);

    pressButton("Turn on calendar access");
    await flushAsync();

    expect(mocks.calendarService.enableCalendarAccessFromPrompt).toHaveBeenCalledTimes(1);
    expect(isModalVisible()).toBe(false);
    expect(mocks.calendarService.syncAllTasksToNativeCalendar).toHaveBeenCalledTimes(1);
    expect(mocks.calendarService.syncAllTasksToNativeCalendar).toHaveBeenCalledWith(
      [reminderTask],
      expect.any(Function)
    );
  });

  it("Turn on opens Settings when OS dialog is blocked, clears backoff & syncs on granted return, and backs off on denied return", async () => {
    mocks.calState.canAskAgain = false;
    mountProvider(true);
    await flushAsync();
    expect(isModalVisible()).toBe(true);

    // User taps Turn on -> opens System Settings
    pressButton("Turn on calendar access");
    await flushAsync();
    expect(mocks.calendarService.enableCalendarAccessFromPrompt).toHaveBeenCalledTimes(1);
    expect(isModalVisible()).toBe(false);

    // Case 1: User returns from Settings WITHOUT granting access -> records decline backoff, does not re-open right away
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(mocks.calendarService.markCalendarSoftAskDeclined).toHaveBeenCalledTimes(1);
    expect(isModalVisible()).toBe(false);

    // Case 2: Later after cooldown, user opens Turn on again -> Settings -> grants permission -> returns
    mocks.setNow(mocks.getNow() + 8 * 24 * 60 * 60 * 1000);
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(true);

    pressButton("Turn on calendar access");
    await flushAsync();
    expect(isModalVisible()).toBe(false);

    mocks.calState.permissionGranted = true;
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();

    expect(mocks.calendarService.clearCalendarSoftAskDeclined).toHaveBeenCalled();
    expect(mocks.calendarService.syncAllTasksToNativeCalendar).toHaveBeenCalledTimes(1);
    expect(isModalVisible()).toBe(false);
  });

  it("Not now records decline backoff and suppresses re-prompts for 7 days", async () => {
    mountProvider(true);
    await flushAsync();
    expect(isModalVisible()).toBe(true);

    pressButton("Not now");
    await flushAsync();

    expect(mocks.calendarService.markCalendarSoftAskDeclined).toHaveBeenCalledTimes(1);
    expect(isModalVisible()).toBe(false);

    // 3 days later: still suppressed
    mocks.setNow(mocks.getNow() + 3 * 24 * 60 * 60 * 1000);
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(false);

    // 7+ days later: allowed again
    mocks.setNow(mocks.getNow() + 4 * 24 * 60 * 60 * 1000);
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(true);
  });

  it("Turn off calendar sync disables sync and closes the modal", async () => {
    mountProvider(true);
    await flushAsync();
    expect(isModalVisible()).toBe(true);

    pressButton("Turn off calendar sync");
    await flushAsync();

    expect(mocks.calendarService.turnOffCalendarSyncFromPrompt).toHaveBeenCalledTimes(1);
    expect(isModalVisible()).toBe(false);

    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();
    expect(isModalVisible()).toBe(false);
  });
});
