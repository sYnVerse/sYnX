import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercises real AuthProvider -> BottomTabNavigator -> TasksScreen -> TaskModal
// with real TanStack Query cache against mocked React Native & Expo APIs.

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

  function useEffectEvent<T extends (...args: any[]) => any>(fn: T): T {
    const ref = useRef(fn);
    ref.current = fn;
    return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
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
    useEffectEvent,
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

  function collectText(node: any = currentTree): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(collectText).join(" ");
    if (node.child) return collectText(node.child);
    if (node.children) return collectText(node.children);
    return "";
  }

  return {
    reactMock,
    jsxRuntimeMock,
    mount,
    resetTree,
    findAll,
    collectText,
    getTree: () => currentTree,
  };
});

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const secureStore = new Map<string, string>();
  const appStateListeners: ((next: string) => void)[] = [];
  const linkingListeners: ((e: { url: string }) => void)[] = [];

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
    TextInput: makeComp("TextInput"),
    Modal: ({ visible, children, ...props }: any) =>
      visible ? harness.reactMock.createElement("Modal", { visible, ...props }, children) : null,
    ScrollView: makeComp("ScrollView"),
    KeyboardAvoidingView: makeComp("KeyboardAvoidingView"),
    FlatList: ({ data = [], renderItem, ListEmptyComponent }: any) => {
      if (data.length === 0) return ListEmptyComponent ?? null;
      return harness.reactMock.createElement(
        "FlatList",
        {},
        data.map((item: any, index: number) => renderItem({ item, index }))
      );
    },
    RefreshControl: makeComp("RefreshControl"),
    ActivityIndicator: makeComp("ActivityIndicator"),
    Pressable: makeComp("Pressable"),
    Animated: {
      Value: class {
        setValue() {}
      },
      View: makeComp("AnimatedView"),
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
    },
    Alert: { alert: vi.fn() },
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
      multiGet: vi.fn(async (keys: string[]) => keys.map((k) => [k, storage.get(k) ?? null])),
      multiRemove: vi.fn(async (keys: string[]) => {
        for (const k of keys) storage.delete(k);
      }),
    },
  };

  const secureStoreMod = {
    getItemAsync: vi.fn(async (k: string) => secureStore.get(k) ?? null),
    setItemAsync: vi.fn(async (k: string, v: string) => {
      secureStore.set(k, v);
    }),
    deleteItemAsync: vi.fn(async (k: string) => {
      secureStore.delete(k);
    }),
  };

  const apiClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  const sessionRefresh = {
    refresh: vi.fn(),
  };

  let authFailureHandler: (() => Promise<void>) | null = null;

  const clientModule = {
    apiClient,
    TOKEN_KEY: "synx_access_token",
    REFRESH_TOKEN_KEY: "synx_refresh_token",
    OPENAUTH_ISSUER: "https://auth.christran.io",
    OPENAUTH_CLIENT_ID: "synx",
    OPENAUTH_TOKEN_ENDPOINT: "https://auth.christran.io/token",
    sessionRefresh,
    setAuthFailureHandler: vi.fn((fn: (() => Promise<void>) | null) => {
      authFailureHandler = fn;
    }),
    secureSessionStore: {
      clearSessionTokens: vi.fn(async () => {
        secureStore.delete("synx_access_token");
        secureStore.delete("synx_refresh_token");
      }),
    },
  };

  const icon = (name: string) => () => harness.reactMock.createElement(name, {});

  const linkingMod = {
    getInitialURL: vi.fn(async () => null),
    addEventListener: vi.fn((_: string, cb: (e: { url: string }) => void) => {
      linkingListeners.push(cb);
      return { remove: vi.fn() };
    }),
  };

  const hapticsMod = {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
    ImpactFeedbackStyle: { Light: "light" },
    NotificationFeedbackType: { Success: "success", Error: "error" },
  };

  const safeAreaMod = {
    SafeAreaView: ({ children, ...p }: any) => harness.reactMock.createElement("SafeAreaView", p, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };

  const iconsMod = {
    Search: icon("Search"),
    Plus: icon("Plus"),
    FolderKanban: icon("FolderKanban"),
    Pencil: icon("Pencil"),
    X: icon("X"),
    CalendarClock: icon("CalendarClock"),
    Trash2: icon("Trash2"),
    Check: icon("Check"),
    Clock: icon("Clock"),
    ListTree: icon("ListTree"),
    Repeat: icon("Repeat"),
    Bell: icon("Bell"),
  };

  return {
    storage,
    secureStore,
    appStateListeners,
    linkingListeners,
    reactNative,
    asyncStorage,
    secureStoreMod,
    apiClient,
    sessionRefresh,
    clientModule,
    linkingMod,
    hapticsMod,
    safeAreaMod,
    iconsMod,
    getAuthFailureHandler: () => authFailureHandler,
    icon,
    triggerAppState: (next: string) => {
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
vi.mock("expo-secure-store", () => mocks.secureStoreMod);
vi.mock("../mobile/node_modules/expo-secure-store", () => mocks.secureStoreMod);
vi.mock("../mobile/node_modules/expo-secure-store/build/SecureStore.js", () => mocks.secureStoreMod);
vi.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: vi.fn(), openAuthSessionAsync: vi.fn() }));
vi.mock("../mobile/node_modules/expo-web-browser", () => ({ maybeCompleteAuthSession: vi.fn(), openAuthSessionAsync: vi.fn() }));
vi.mock("../mobile/node_modules/expo-web-browser/build/WebBrowser.js", () => ({ maybeCompleteAuthSession: vi.fn(), openAuthSessionAsync: vi.fn() }));
vi.mock("expo-auth-session", () => ({ useAuthRequest: () => [null, null, vi.fn(async () => ({ type: "cancel" }))] }));
vi.mock("../mobile/node_modules/expo-auth-session", () => ({ useAuthRequest: () => [null, null, vi.fn(async () => ({ type: "cancel" }))] }));
vi.mock("../mobile/node_modules/expo-auth-session/build/index.js", () => ({ useAuthRequest: () => [null, null, vi.fn(async () => ({ type: "cancel" }))] }));
vi.mock("expo-linking", () => mocks.linkingMod);
vi.mock("../mobile/node_modules/expo-linking", () => mocks.linkingMod);
vi.mock("../mobile/node_modules/expo-linking/build/Linking.js", () => mocks.linkingMod);
vi.mock("expo-haptics", () => mocks.hapticsMod);
vi.mock("../mobile/node_modules/expo-haptics", () => mocks.hapticsMod);
vi.mock("../mobile/node_modules/expo-haptics/build/Haptics.js", () => mocks.hapticsMod);
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("../mobile/node_modules/expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("../mobile/node_modules/expo-status-bar/build/StatusBar.js", () => ({ StatusBar: () => null }));
vi.mock("@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
vi.mock("../mobile/node_modules/@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
vi.mock("../mobile/node_modules/@expo/ui/build/community/datetime-picker/index.js", () => ({ DateTimePicker: () => null }));
vi.mock("react-native-safe-area-context", () => mocks.safeAreaMod);
vi.mock("../mobile/node_modules/react-native-safe-area-context", () => mocks.safeAreaMod);
vi.mock("../mobile/node_modules/react-native-safe-area-context/lib/commonjs/index.js", () => mocks.safeAreaMod);
vi.mock("lucide-react-native", () => mocks.iconsMod);
vi.mock("../mobile/node_modules/lucide-react-native", () => mocks.iconsMod);
vi.mock("../mobile/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js", () => mocks.iconsMod);
vi.mock("../mobile/src/api/client", () => mocks.clientModule);
vi.mock("../mobile/src/services/timeZoneSync", () => ({
  checkHomeTimeZone: vi.fn(async () => {}),
  resetTimeZoneSync: vi.fn(),
}));
vi.mock("../mobile/src/services/displayNameSuggestion", () => ({
  maybePromptDisplayNameSuggestion: vi.fn(),
  resetDisplayNameSuggestion: vi.fn(),
}));
vi.mock("../mobile/src/services/signOutCleanup", () => ({
  clearSignedOutDeviceData: vi.fn(async () => {
    await mocks.clientModule.secureSessionStore.clearSessionTokens();
    mocks.storage.clear();
  }),
}));
vi.mock("../mobile/src/services/widgetSync", () => ({
  syncActiveList: vi.fn(async () => {}),
  syncPinnedList: vi.fn(async () => {}),
}));
vi.mock("../mobile/src/services/calendar", () => ({
  syncTaskToNativeCalendar: vi.fn(async () => null),
  removeTaskFromNativeCalendar: vi.fn(async () => {}),
}));
vi.mock("../mobile/src/components/NativeUpdateBanner", () => ({
  NativeUpdateBanner: () => null,
}));
vi.mock("../mobile/src/context/PushPromptContext", () => ({
  PushPromptProvider: ({ children }: any) => children,
  usePushPrompt: () => ({
    maybeAskOnReminder: vi.fn(async () => {}),
    refreshPushRegistration: vi.fn(async () => {}),
  }),
}));
vi.mock("../mobile/src/components/FloatingTabBar", () => ({
  FloatingTabBar: () => null,
}));
vi.mock("../mobile/src/components/ScreenContainer", () => ({
  ScreenContainer: ({ children }: any) => children,
}));
vi.mock("../mobile/src/components/ChangelogModal", () => ({
  ChangelogModal: () => null,
}));
vi.mock("../mobile/src/components/TaskBreakdownModal", () => ({
  TaskBreakdownModal: () => null,
}));
vi.mock("../mobile/src/components/ListOptionsModal", () => ({
  ListOptionsModal: () => null,
}));
vi.mock("../mobile/src/components/EditListModal", () => ({
  EditListModal: () => null,
}));
vi.mock("../mobile/src/components/ShareListModal", () => ({
  ShareListModal: () => null,
}));
vi.mock("../mobile/src/screens/CalendarScreen", () => ({
  CalendarScreen: () => null,
}));
vi.mock("../mobile/src/screens/ListsScreen", () => ({
  ListsScreen: () => null,
}));
vi.mock("../mobile/src/screens/SettingsScreen", () => ({
  SettingsScreen: () => null,
}));

import { QueryClient, QueryClientProvider } from "../mobile/node_modules/@tanstack/react-query/build/modern/index.js";
import { ThemeProvider } from "../mobile/src/context/ThemeContext";
import { ToastProvider } from "../mobile/src/context/ToastContext";
import { AuthProvider } from "../mobile/src/context/AuthContext";
import { BottomTabNavigator } from "../mobile/src/navigation/BottomTabNavigator";
import { STORAGE_KEY_LAST_ACTIVE_LIST_ID } from "../mobile/src/services/widgetPreferences";
import type { TodoItem, TodoList } from "../shared";

function makeJwt(sub: string, email: string) {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, email }));
  return `${header}.${payload}.sig`;
}

async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("mobile resume and cached startup (#198)", () => {
  let queryClient: QueryClient;

  const sampleList: TodoList = {
    id: "list-1",
    name: "Work",
    category: null,
    ownerId: "user-1",
    createdAt: 1000,
    shareMode: "private",
    isOwner: true,
    canEdit: true,
  };

  const sampleTodo: TodoItem = {
    id: "todo-1",
    listId: "list-1",
    text: "Existing task",
    completed: false,
    priority: "medium",
    recurrence: "none",
    reminderSent: false,
    createdAt: 2000,
  };

  beforeEach(() => {
    harness.resetTree();
    mocks.storage.clear();
    mocks.secureStore.clear();
    mocks.appStateListeners.length = 0;
    mocks.linkingListeners.length = 0;
    vi.clearAllMocks();

    mocks.storage.set("last_seen_changelog_version", "v3.9.0");
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 1000 * 60 * 5 },
      },
    });
  });

  function mountApp() {
    harness.mount(() =>
      harness.reactMock.createElement(
        QueryClientProvider,
        { client: queryClient },
        harness.reactMock.createElement(
          ThemeProvider,
          null,
          harness.reactMock.createElement(
            ToastProvider,
            null,
            harness.reactMock.createElement(
              AuthProvider,
              null,
              harness.reactMock.createElement(BottomTabNavigator, null)
            )
          )
        )
      )
    );
  }

  it("keeps the add-task sheet and typed draft intact on screen-lock / app-switch resume with a rotated access token", async () => {
    const tok1 = makeJwt("user-1", "chris@example.com");
    const tok2 = makeJwt("user-1", "chris@example.com") + "-rotated";
    mocks.secureStore.set("synx_access_token", tok1);
    mocks.secureStore.set("synx_refresh_token", "refresh-1");
    mocks.storage.set(STORAGE_KEY_LAST_ACTIVE_LIST_ID, "list-1");

    mocks.sessionRefresh.refresh
      .mockResolvedValueOnce({
        ok: true,
        tokens: { accessToken: tok1, refreshToken: "refresh-1" },
        rotatedRefreshToken: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        tokens: { accessToken: tok2, refreshToken: "refresh-2" },
        rotatedRefreshToken: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        tokens: { accessToken: tok2 + "-2", refreshToken: "refresh-3" },
        rotatedRefreshToken: true,
      });

    mocks.apiClient.get.mockImplementation(async (url: string) => {
      if (url === "/api/v1/settings") {
        return { data: { settings: { userId: "user-1", email: "chris@example.com" } } };
      }
      if (url === "/api/v1/lists/list-1") {
        return { data: { list: sampleList } };
      }
      if (url === "/api/v1/todos?listId=list-1") {
        return { data: { todos: [sampleTodo], pendingDeleteRequests: [] } };
      }
      if (url === "/api/v1/delete-requests?listId=list-1") {
        return { data: { requests: [] } };
      }
      return { data: {} };
    });

    mountApp();
    await flushAsync();

    // Open the New Task sheet via FAB and type a draft.
    const addBtn = harness.findAll(
      (n) => n.kind === "host" && n.type === "TouchableOpacity" && n.props.accessibilityLabel === "Add task"
    )[0];
    expect(addBtn).toBeDefined();
    addBtn.props.onPress();
    await flushAsync(2);

    const descInput = harness.findAll(
      (n) => n.kind === "host" && n.type === "TextInput" && n.props.accessibilityLabel === "Task description"
    )[0];
    expect(descInput).toBeDefined();
    descInput.props.onChangeText("Unsaved draft task");
    await flushAsync(2);

    const inputBeforeResume = harness.findAll(
      (n) => n.kind === "host" && n.type === "TextInput" && n.props.accessibilityLabel === "Task description"
    )[0];
    expect(inputBeforeResume.props.value).toBe("Unsaved draft task");

    // 1) Simulate screen timeout / lock -> unlock (inactive -> active)
    mocks.triggerAppState("inactive");
    mocks.triggerAppState("active");
    await flushAsync();

    expect(harness.collectText()).not.toContain("Loading your lists...");
    const inputAfterUnlock = harness.findAll(
      (n) => n.kind === "host" && n.type === "TextInput" && n.props.accessibilityLabel === "Task description"
    )[0];
    expect(inputAfterUnlock).toBeDefined();
    expect(inputAfterUnlock.props.value).toBe("Unsaved draft task");

    // 2) Simulate switching to another app and back (inactive -> background -> active)
    mocks.triggerAppState("inactive");
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();

    expect(harness.collectText()).not.toContain("Loading your lists...");
    const inputAfterAppSwitch = harness.findAll(
      (n) => n.kind === "host" && n.type === "TextInput" && n.props.accessibilityLabel === "Task description"
    )[0];
    expect(inputAfterAppSwitch).toBeDefined();
    expect(inputAfterAppSwitch.props.value).toBe("Unsaved draft task");
  });

  it("keeps an in-progress edit-task sheet and its modified draft intact on resume", async () => {
    const tok1 = makeJwt("user-1", "chris@example.com");
    const tok2 = makeJwt("user-1", "chris@example.com") + "-rotated";
    mocks.secureStore.set("synx_access_token", tok1);
    mocks.secureStore.set("synx_refresh_token", "refresh-1");
    mocks.storage.set(STORAGE_KEY_LAST_ACTIVE_LIST_ID, "list-1");

    mocks.sessionRefresh.refresh
      .mockResolvedValueOnce({
        ok: true,
        tokens: { accessToken: tok1, refreshToken: "refresh-1" },
        rotatedRefreshToken: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        tokens: { accessToken: tok2, refreshToken: "refresh-2" },
        rotatedRefreshToken: true,
      });

    mocks.apiClient.get.mockImplementation(async (url: string) => {
      if (url === "/api/v1/settings") {
        return { data: { settings: { userId: "user-1", email: "chris@example.com" } } };
      }
      if (url === "/api/v1/lists/list-1") {
        return { data: { list: sampleList } };
      }
      if (url === "/api/v1/todos?listId=list-1") {
        return { data: { todos: [sampleTodo], pendingDeleteRequests: [] } };
      }
      if (url === "/api/v1/delete-requests?listId=list-1") {
        return { data: { requests: [] } };
      }
      return { data: {} };
    });

    mountApp();
    await flushAsync();

    // Tap the task card to open Edit Task modal
    const editBtn = harness.findAll(
      (n) => n.kind === "host" && n.type === "TouchableOpacity" && n.props.accessibilityLabel === "Edit task Existing task"
    )[0];
    expect(editBtn).toBeDefined();
    editBtn.props.onPress();
    await flushAsync(2);

    const descInput = harness.findAll(
      (n) => n.kind === "host" && n.type === "TextInput" && n.props.accessibilityLabel === "Task description"
    )[0];
    expect(descInput.props.value).toBe("Existing task");
    descInput.props.onChangeText("Edited draft title");
    await flushAsync(2);

    // Resume with rotated token
    mocks.triggerAppState("background");
    mocks.triggerAppState("active");
    await flushAsync();

    expect(harness.collectText()).not.toContain("Loading your lists...");
    const editInputAfter = harness.findAll(
      (n) => n.kind === "host" && n.type === "TextInput" && n.props.accessibilityLabel === "Task description"
    )[0];
    expect(editInputAfter).toBeDefined();
    expect(editInputAfter.props.value).toBe("Edited draft title");
  });

  it("shows cached React Query tasks immediately on cold start and refreshes in the background", async () => {
    const tok1 = makeJwt("user-1", "chris@example.com");
    mocks.secureStore.set("synx_access_token", tok1);
    mocks.storage.set(STORAGE_KEY_LAST_ACTIVE_LIST_ID, "list-1");

    // Pre-populate React Query cache (as PersistQueryClientProvider does on cold start)
    queryClient.setQueryData(["list_meta", "list-1"], sampleList);
    queryClient.setQueryData(["todos", "list-1"], [sampleTodo]);

    let resolveTodosFetch!: (val: any) => void;
    let resolveListFetch!: (val: any) => void;

    mocks.apiClient.get.mockImplementation((url: string) => {
      if (url === "/api/v1/settings") {
        return Promise.resolve({ data: { settings: { userId: "user-1", email: "chris@example.com" } } });
      }
      if (url === "/api/v1/lists/list-1") {
        return new Promise((resolve) => {
          resolveListFetch = resolve;
        });
      }
      if (url === "/api/v1/todos?listId=list-1") {
        return new Promise((resolve) => {
          resolveTodosFetch = resolve;
        });
      }
      return Promise.resolve({ data: { requests: [] } });
    });

    mountApp();
    await flushAsync(4);

    // Cached task is visible right away while network requests are still pending
    expect(harness.collectText()).not.toContain("Loading your lists...");
    expect(harness.collectText()).toContain("Existing task");

    // Background refresh completes with an updated task list
    resolveListFetch({ data: { list: sampleList } });
    resolveTodosFetch({
      data: {
        todos: [sampleTodo, { ...sampleTodo, id: "todo-2", text: "Freshly synced task" }],
        pendingDeleteRequests: [],
      },
    });
    await flushAsync();

    expect(harness.collectText()).toContain("Freshly synced task");
  });

  it("still shows Loading your lists on a fresh sign-in with no cached data, and returns to sign-in on sign-out", async () => {
    const tok1 = makeJwt("user-1", "chris@example.com");
    mocks.secureStore.set("synx_access_token", tok1);

    let resolveLists!: (val: any) => void;
    mocks.apiClient.get.mockImplementation((url: string) => {
      if (url === "/api/v1/settings") {
        return Promise.resolve({ data: { settings: { userId: "user-1", email: "chris@example.com" } } });
      }
      if (url === "/api/v1/lists") {
        return new Promise((resolve) => {
          resolveLists = resolve;
        });
      }
      if (url === "/api/v1/lists/list-1") {
        return Promise.resolve({ data: { list: sampleList } });
      }
      if (url === "/api/v1/todos?listId=list-1") {
        return Promise.resolve({ data: { todos: [sampleTodo], pendingDeleteRequests: [] } });
      }
      return Promise.resolve({ data: { requests: [] } });
    });

    mountApp();
    await flushAsync(4);

    // Cold start with empty cache shows the loader
    expect(harness.collectText()).toContain("Loading your lists...");

    resolveLists({ data: { lists: [sampleList] } });
    await flushAsync();

    expect(harness.collectText()).not.toContain("Loading your lists...");
    expect(harness.collectText()).toContain("Existing task");

    // Hard auth failure clears session and returns to sign-in screen
    const failureHandler = mocks.getAuthFailureHandler();
    expect(failureHandler).toBeTruthy();
    await failureHandler!();
    await flushAsync();

    expect(harness.collectText()).toContain("Sign In with sYnID");
  });
});
