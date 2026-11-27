import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "react-router";
import type { Todo } from "../backend/services/to-do-manager";
import { ROLLBACK_ERROR_MESSAGE, formatSaveError } from "../web/app/features/list/hooks/useOptimisticField";

const harness = vi.hoisted(() => {
  type HookState = {
    hooks: any[];
    effects: { deps?: any[]; cleanup?: () => void; fn: () => void | (() => void) }[];
  };
  const instances = new Map<string, HookState>();
  let currentPath = "root";
  let hookIdx = 0;
  let pendingEffects: { path: string; idx: number }[] = [];
  let rootRenderFn: (() => void) | null = null;
  let activeTransitions = 0;

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

  const contextValues = new Map<symbol, any>();

  function createContext<T>(defaultValue: T) {
    const id = Symbol("Context");
    return {
      id,
      _currentValue: defaultValue,
      Provider: ({ value, children }: { value: T; children?: any }) => ({ value, children }),
    };
  }

  function useContext<T>(ctx: any): T {
    if (contextValues.has(ctx.id)) return contextValues.get(ctx.id);
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

  function useOptimistic<TState, TAction>(
    passthrough: TState,
    reducer: (state: TState, action: TAction) => TState
  ): [TState, (action: TAction) => void] {
    const path = currentPath;
    const idx = hookIdx++;
    const inst = getInstance(path);
    if (!(idx in inst.hooks)) {
      inst.hooks[idx] = { hasOptimistic: false, value: passthrough, activeAtSet: 0 };
    }
    const slot = inst.hooks[idx];
    if (activeTransitions === 0) {
      slot.hasOptimistic = false;
      slot.value = passthrough;
    }
    const baseState = slot.hasOptimistic ? slot.value : passthrough;
    const addOptimistic = (action: TAction) => {
      slot.hasOptimistic = true;
      slot.value = reducer(passthrough, action);
      scheduleRender();
    };
    return [baseState, addOptimistic];
  }

  function startTransition(scope: () => void | Promise<void>) {
    activeTransitions++;
    try {
      const result = scope();
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).finally(() => {
          activeTransitions = Math.max(0, activeTransitions - 1);
          scheduleRender();
        });
      } else {
        activeTransitions = Math.max(0, activeTransitions - 1);
      }
    } catch (err) {
      activeTransitions = Math.max(0, activeTransitions - 1);
      throw err;
    }
  }

  function flushEffects() {
    while (pendingEffects.length > 0) {
      const batch = pendingEffects.splice(0, pendingEffects.length);
      for (const { path, idx } of batch) {
        const inst = instances.get(path);
        const eff = inst?.effects[idx];
        if (!eff) continue;
        if (eff.cleanup) {
          try {
            eff.cleanup();
          } catch {
            // ignore
          }
          eff.cleanup = undefined;
        }
        const cleanup = eff.fn();
        if (typeof cleanup === "function") {
          eff.cleanup = cleanup;
        }
      }
    }
  }

  function reset() {
    for (const inst of instances.values()) {
      for (const eff of inst.effects) {
        if (eff?.cleanup) {
          try {
            eff.cleanup();
          } catch {
            // ignore
          }
        }
      }
    }
    instances.clear();
    pendingEffects = [];
    rootRenderFn = null;
    activeTransitions = 0;
    contextValues.clear();
  }

  function runRender(path: string, fn: () => any) {
    currentPath = path;
    hookIdx = 0;
    return fn();
  }

  return {
    createContext,
    useContext,
    useState,
    useRef,
    useEffect,
    useCallback,
    useOptimistic,
    startTransition,
    flushEffects,
    runRender,
    reset,
    contextValues,
    setRootRender(fn: () => void) {
      rootRenderFn = fn;
    },
  };
});

type MockFetcherState = {
  state: "idle" | "submitting" | "loading";
  data: any;
  formData: FormData | undefined;
  submitCalls: Array<{ payload: Record<string, string>; seq: number }>;
  pendingResolvers: Array<() => void>;
};

const fetcherMocks = vi.hoisted(() => {
  const fetchers = new Map<string, MockFetcherState>();
  let anonymousCount = 0;
  let seqCounter = 0;
  let rerender: (() => void) | null = null;

  function getOrCreate(key?: string) {
    const k = key || `anon-${++anonymousCount}`;
    let entry = fetchers.get(k);
    if (!entry) {
      entry = {
        state: "idle",
        data: undefined,
        formData: undefined,
        submitCalls: [],
        pendingResolvers: [],
      };
      fetchers.set(k, entry);
    }
    return { key: k, entry };
  }

  return {
    fetchers,
    getOrCreate,
    resolveEntry: (key: string) => {
      const entry = fetchers.get(key);
      if (!entry) return;
      for (const res of entry.pendingResolvers.splice(0)) {
        res();
      }
    },
    nextSeq: () => ++seqCounter,
    setRerender: (fn: (() => void) | null) => {
      rerender = fn;
    },
    triggerRerender: () => {
      rerender?.();
    },
    reset: () => {
      for (const entry of fetchers.values()) {
        for (const res of entry.pendingResolvers) res();
      }
      fetchers.clear();
      anonymousCount = 0;
      seqCounter = 0;
      rerender = null;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    createContext: harness.createContext,
    useContext: harness.useContext,
    useState: harness.useState,
    useRef: harness.useRef,
    useEffect: harness.useEffect,
    useCallback: harness.useCallback,
    useOptimistic: harness.useOptimistic,
    startTransition: harness.startTransition,
  };
});

vi.mock("react/jsx-runtime", () => {
  const createEl = (type: any, props: any, key?: any) => ({
    type,
    key: key ?? null,
    props: props || {},
  });
  return {
    Fragment: Symbol.for("react.fragment"),
    jsx: createEl,
    jsxs: createEl,
  };
});

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: (opts?: { key?: string }) => {
      const { entry } = fetcherMocks.getOrCreate(opts?.key);
      return {
        get state() {
          return entry.state;
        },
        get data() {
          return entry.data;
        },
        get formData() {
          return entry.formData;
        },
        submit: (target: Record<string, string>) => {
          const seq = fetcherMocks.nextSeq();
          const fd = new FormData();
          for (const [k, v] of Object.entries(target)) fd.set(k, v);
          entry.state = "submitting";
          entry.formData = fd;
          entry.submitCalls.push({ payload: { ...target }, seq });
          fetcherMocks.triggerRerender();
          return new Promise<void>((resolve) => {
            entry.pendingResolvers.push(resolve);
          });
        },
        Form: (props: any) => ({ type: "form", props }),
      };
    },
  };
});

vi.mock("../web/app/features/list/components/ReminderPicker", () => ({
  ReminderPicker: () => null,
}));
vi.mock("../web/app/features/list/components/CompletedSectionToggle", () => ({
  CompletedSectionToggle: () => null,
}));
vi.mock("../web/app/features/list/components/FloatingPopover", () => ({
  FloatingPopover: ({ open, children }: { open: boolean; children?: any }) =>
    open ? { type: "div", props: { children } } : null,
}));

import { GuestContext } from "../web/app/guest-context";
import { TodoItem } from "../web/app/features/list/components/TodoItem";
import { PriorityPicker } from "../web/app/features/list/components/pickers";
import { action as listAction } from "../web/app/features/list/action.server";
import { TodoManager } from "../backend/services/to-do-manager";

function findElements(node: any, pred: (el: any) => boolean, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props?.children !== undefined) {
    findElements(node.props.children, pred, out);
  }
  return out;
}

function textOf(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props?.children !== undefined) {
    return textOf(node.props.children);
  }
  return "";
}

async function flushMicrotasks(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

const baseTodo: Todo = {
  id: "todo-1",
  listId: "list-1",
  text: "Buy milk",
  completed: false,
  createdAt: 1000,
  priority: "none",
  recurrence: "none",
};

describe("web optimistic mutations (#170)", () => {
  let serverTodo: Todo;
  let onNotify: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let currentTree: any;

  function mountTodoItem(initialTodo: Todo = baseTodo) {
    serverTodo = { ...initialTodo };
    harness.contextValues.set((GuestContext as any).id, {
      isLoggedIn: true,
      canSetReminders: true,
      currentUserId: "user-1",
      listOwnerId: "user-1",
      onGuestAction: vi.fn(),
    });
    const render = () => {
      currentTree = harness.runRender("TodoItem", () =>
        TodoItem({ todo: serverTodo, canEdit: true, onNotify })
      );
      harness.flushEffects();
    };
    harness.setRootRender(render);
    fetcherMocks.setRerender(render);
    render();
    return { render };
  }

  function mountPriorityPicker(initialPriority: Todo["priority"] = "none") {
    serverTodo = { ...baseTodo, priority: initialPriority };
    harness.contextValues.set((GuestContext as any).id, {
      isLoggedIn: true,
      canSetReminders: true,
      currentUserId: "user-1",
      listOwnerId: "user-1",
      onGuestAction: vi.fn(),
    });
    const render = () => {
      currentTree = harness.runRender("PriorityPicker", () =>
        PriorityPicker({ currentPriority: serverTodo.priority, todoId: serverTodo.id, onNotify })
      );
      harness.flushEffects();
    };
    harness.setRootRender(render);
    fetcherMocks.setRerender(render);
    render();
    return { render };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    harness.reset();
    fetcherMocks.reset();
    onNotify = vi.fn();
  });

  afterEach(() => {
    harness.reset();
    fetcherMocks.reset();
    vi.useRealTimers();
  });

  const submitToggle = () => {
    const toggleForm = findElements(
      currentTree,
      (el) => el.type === "form" && findElements(el, (c) => c.type === "button" && "data-checked" in c.props).length > 0
    )[0];
    toggleForm.props.onSubmit({ preventDefault: () => {} });
  };

  it("reverts check-off and shows visible error when server action fails", async () => {
    const { render } = mountTodoItem();
    const getCheckbox = () =>
      findElements(currentTree, (el) => el.type === "button" && "data-checked" in el.props)[0];

    expect(getCheckbox().props["data-checked"]).toBe(false);

    // Submit check-off: optimistically checked before server responds
    submitToggle();
    await flushMicrotasks();
    expect(getCheckbox().props["data-checked"]).toBe(true);

    const toggleState = fetcherMocks.fetchers.get("todo-toggle-todo-1")!;
    expect(toggleState.submitCalls[0].payload).toEqual({
      intent: "setCompleted",
      id: "todo-1",
      completed: "true",
    });

    // Server write fails (fetcher.data contains error, loader keeps completed=false)
    toggleState.state = "idle";
    toggleState.data = { error: "D1 unavailable" };
    fetcherMocks.resolveEntry("todo-toggle-todo-1");
    render();
    await flushMicrotasks();

    expect(getCheckbox().props["data-checked"]).toBe(false);
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(formatSaveError("D1 unavailable"));
    expect(onNotify.mock.calls[0][0]).toContain(ROLLBACK_ERROR_MESSAGE);
  });

  it("handles rapid check/uncheck out-of-order responses and ends in last intended state", async () => {
    const { render } = mountTodoItem();
    const getCheckbox = () =>
      findElements(currentTree, (el) => el.type === "button" && "data-checked" in el.props)[0];

    // Rapid click 1 (false -> true) then click 2 (true -> false) while pending
    submitToggle();
    await flushMicrotasks();
    expect(getCheckbox().props["data-checked"]).toBe(true);

    submitToggle();
    await flushMicrotasks();
    expect(getCheckbox().props["data-checked"]).toBe(false);

    const toggleState = fetcherMocks.fetchers.get("todo-toggle-todo-1")!;
    expect(toggleState.submitCalls.map((c) => c.payload)).toEqual([
      { intent: "setCompleted", id: "todo-1", completed: "true" },
      { intent: "setCompleted", id: "todo-1", completed: "false" },
    ]);

    // Simulate out-of-order response from call #1 arriving while call #2 is still in flight
    toggleState.data = { success: true, todo: { ...serverTodo, completed: true } };
    // Fetcher remains non-idle until latest keyed request (#2) completes
    render();
    await flushMicrotasks();
    expect(getCheckbox().props["data-checked"]).toBe(false);

    // Final request (#2: completed=false) settles and loader revalidates to false
    serverTodo = { ...serverTodo, completed: false };
    toggleState.state = "idle";
    toggleState.data = { success: true, todo: serverTodo };
    fetcherMocks.resolveEntry("todo-toggle-todo-1");
    render();
    await flushMicrotasks();

    expect(getCheckbox().props["data-checked"]).toBe(false);
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("repeating task shows done optimistically while saving and uses server reminder date after revalidation", async () => {
    const originalReminder = 1_700_000_000_000;
    const serverNextReminder = originalReminder + 86_400_000;
    const { render } = mountTodoItem({
      ...baseTodo,
      recurrence: "daily",
      reminderAt: originalReminder,
    });

    const getCheckbox = () =>
      findElements(currentTree, (el) => el.type === "button" && "data-checked" in el.props)[0];

    submitToggle();
    await flushMicrotasks();

    // Shows checked optimistically without fabricating a client reminder timestamp
    expect(getCheckbox().props["data-checked"]).toBe(true);
    expect(serverTodo.reminderAt).toBe(originalReminder);

    // Server returns rescheduled todo and revalidation updates loader prop
    const toggleState = fetcherMocks.fetchers.get("todo-toggle-todo-1")!;
    serverTodo = {
      ...serverTodo,
      completed: false,
      reminderAt: serverNextReminder,
    };
    toggleState.state = "idle";
    toggleState.data = { success: true, rescheduled: true, todo: serverTodo };
    fetcherMocks.resolveEntry("todo-toggle-todo-1");
    render();
    await flushMicrotasks();

    // After flash clears, settled state shows server reminder date and completed=false, plus toast
    vi.advanceTimersByTime(450);
    await flushMicrotasks();
    expect(getCheckbox().props["data-checked"]).toBe(false);
    expect(serverTodo.reminderAt).toBe(serverNextReminder);
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify.mock.calls[0][0]).toContain("Rescheduled for");
  });

  it("optimistic check-off and server state match after success", async () => {
    const { render } = mountTodoItem();
    const getCheckbox = () =>
      findElements(currentTree, (el) => el.type === "button" && "data-checked" in el.props)[0];

    submitToggle();
    await flushMicrotasks();
    expect(getCheckbox().props["data-checked"]).toBe(true);

    const toggleState = fetcherMocks.fetchers.get("todo-toggle-todo-1")!;
    serverTodo = { ...serverTodo, completed: true };
    toggleState.state = "idle";
    toggleState.data = { success: true, todo: serverTodo };
    fetcherMocks.resolveEntry("todo-toggle-todo-1");
    render();
    await flushMicrotasks();

    expect(getCheckbox().props["data-checked"]).toBe(true);
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("reverts rename and priority optimistically when saving fails, and keeps updated state on success", async () => {
    // 1) Rename rollback on failure
    const item = mountTodoItem();
    const getEditButton = () =>
      findElements(currentTree, (el) => el.type === "button" && el.props["aria-label"] === "Edit task")[0];
    const getTitleSpan = () =>
      findElements(currentTree, (el) => el.type === "span" && typeof el.props.title === "string")[0];

    getEditButton().props.onClick();
    await flushMicrotasks();

    const editInput = findElements(currentTree, (el) => el.type === "input" && el.props.type === "text")[0];
    editInput.props.onChange({ target: { value: "Buy oat milk" } });
    await flushMicrotasks();

    const editForm = findElements(
      currentTree,
      (el) => el.type === "form" && findElements(el, (c) => c.type === "button" && textOf(c) === "Save").length > 0
    )[0];
    editForm.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(textOf(getTitleSpan())).toBe("Buy oat milk");
    const editFetcher = fetcherMocks.fetchers.get("todo-edit-todo-1")!;
    editFetcher.state = "idle";
    editFetcher.data = undefined; // e.g. dropped network response
    fetcherMocks.resolveEntry("todo-edit-todo-1");
    item.render();
    await flushMicrotasks();

    expect(textOf(getTitleSpan())).toBe("Buy milk");
    expect(onNotify).toHaveBeenCalledWith(ROLLBACK_ERROR_MESSAGE);

    // 2) Priority optimistic update + rollback on failure
    harness.reset();
    fetcherMocks.reset();
    onNotify.mockReset();

    const picker = mountPriorityPicker("none");
    const getTrigger = () =>
      findElements(currentTree, (el) => el.type === "button" && "aria-busy" in el.props)[0];

    getTrigger().props.onClick();
    await flushMicrotasks();
    const highBtn = findElements(currentTree, (el) => el.type === "button" && textOf(el) === "High")[0];
    highBtn.props.onClick();
    await flushMicrotasks();

    expect(textOf(getTrigger())).toContain("High");
    const priorityFetcher = fetcherMocks.fetchers.get("todo-priority-todo-1")!;
    expect(priorityFetcher.submitCalls[0].payload).toEqual({
      intent: "updatePriority",
      id: "todo-1",
      priority: "high",
    });

    priorityFetcher.state = "idle";
    priorityFetcher.data = { error: "Forbidden" };
    fetcherMocks.resolveEntry("todo-priority-todo-1");
    picker.render();
    await flushMicrotasks();

    expect(textOf(getTrigger())).toContain("None");
    expect(onNotify).toHaveBeenCalledWith(formatSaveError("Forbidden"));
  });

  it("shows slow pending indicator after 10 seconds and clears it once settled", async () => {
    const { render } = mountTodoItem();
    const getSlowBadge = () =>
      findElements(currentTree, (el) => el.type === "span" && el.props["data-slow-pending"] === "true");

    submitToggle();
    await flushMicrotasks();
    expect(getSlowBadge()).toHaveLength(0);

    vi.advanceTimersByTime(9999);
    await flushMicrotasks();
    expect(getSlowBadge()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(getSlowBadge()).toHaveLength(1);
    expect(textOf(getSlowBadge()[0])).toContain("Saving");

    const toggleState = fetcherMocks.fetchers.get("todo-toggle-todo-1")!;
    serverTodo = { ...serverTodo, completed: true };
    toggleState.state = "idle";
    toggleState.data = { success: true, todo: serverTodo };
    fetcherMocks.resolveEntry("todo-toggle-todo-1");
    render();
    await flushMicrotasks();
    expect(getSlowBadge()).toHaveLength(0);
  });
});

describe("server idempotency and D1 error safeguards (#170)", () => {
  it("handles duplicate submissions idempotently in real D1", async () => {
    const listId = `list-opt-${crypto.randomUUID()}`;
    const userId = "user-opt-1";
    await env.DB.prepare("INSERT INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(listId, "Optimistic List", userId, Date.now())
      .run();

    const manager = new TodoManager(env.DB, listId);
    const created = await manager.create("Idempotent task");

    const postIntent = async (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [k, v] of Object.entries(fields)) formData.set(k, v);
      const req = new Request(`http://localhost/${listId}`, {
        method: "POST",
        headers: {
          Cookie: `synx_auth_session=e2e_test_session:${userId}:opt@example.com`,
        },
        body: formData,
      });
      const res = await listAction({
        request: req,
        params: { id: listId },
        context: { cloudflare: { env: { ...env, ALLOW_DEV_TEST_AUTH: "true" } } },
      } as unknown as ActionFunctionArgs);
      if (res instanceof Response) {
        return { status: res.status, data: await res.json() };
      }
      return { status: 200, data: res };
    };

    // Duplicate setCompleted=true twice
    const r1 = await postIntent({ intent: "setCompleted", id: created.id, completed: "true" });
    const r2 = await postIntent({ intent: "setCompleted", id: created.id, completed: "true" });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((r2.data as { todo: Todo }).todo.completed).toBe(true);

    // Duplicate priority & rename
    const p1 = await postIntent({ intent: "updatePriority", id: created.id, priority: "high" });
    const p2 = await postIntent({ intent: "updatePriority", id: created.id, priority: "high" });
    expect((p1.data as { success: boolean }).success).toBe(true);
    expect((p2.data as { todo: Todo }).todo.priority).toBe("high");

    const t1 = await postIntent({ intent: "updateText", id: created.id, text: "Updated title" });
    const t2 = await postIntent({ intent: "updateText", id: created.id, text: "Updated title" });
    expect((t1.data as { success: boolean }).success).toBe(true);
    expect((t2.data as { todo: Todo }).todo.text).toBe("Updated title");
  });

  it("returns an error status and never reports success when D1 fails", async () => {
    const failingDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes("SELECT owner_id, share_mode FROM lists")) {
              return { owner_id: "user-opt-err", share_mode: "private" };
            }
            if (sql.includes("SELECT * FROM todos WHERE id = ?")) {
              return {
                id: "todo-err-1",
                list_id: "list-err-1",
                text: "Original",
                completed: 0,
                created_at: 1000,
                priority: "none",
                reminder_at: null,
                reminder_sent: null,
                parent_id: null,
                recurrence: "none",
                duration_minutes: null,
              };
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (sql.includes("UPDATE todos")) {
              throw new Error("D1_ERROR: disk I/O failed");
            }
            return { success: true };
          },
        }),
      }),
    };

    const formData = new FormData();
    formData.set("intent", "setCompleted");
    formData.set("id", "todo-err-1");
    formData.set("completed", "true");

    const req = new Request("http://localhost/list-err-1", {
      method: "POST",
      headers: {
        Cookie: "synx_auth_session=e2e_test_session:user-opt-err:err@example.com",
      },
      body: formData,
    });

    const res = await listAction({
      request: req,
      params: { id: "list-err-1" },
      context: {
        cloudflare: {
          env: { DB: failingDb, ALLOW_DEV_TEST_AUTH: "true" },
        },
      },
    } as unknown as ActionFunctionArgs);

    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(500);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).not.toBe(true);
    expect(data.error).toBe(ROLLBACK_ERROR_MESSAGE);
  });
});
