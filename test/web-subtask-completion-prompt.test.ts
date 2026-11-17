import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "react-router";
import type { GuestActionPayload } from "../app/guest-context";
import type { Todo } from "../app/to-do-manager";
import { ROLLBACK_ERROR_MESSAGE, formatSaveError } from "../app/features/list/hooks/useOptimisticField";
import { formatSubtaskCompletionPrompt } from "../shared";

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
    const idx = hookIdx++;
    const inst = getInstance(currentPath);
    if (!(idx in inst.hooks)) {
      inst.hooks[idx] = { hasOptimistic: false, value: passthrough };
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
  }

  function runRender(path: string, fn: () => any) {
    currentPath = path;
    hookIdx = 0;
    return fn();
  }

  return {
    useState,
    useRef,
    useEffect,
    useCallback,
    useOptimistic,
    startTransition,
    flushEffects,
    runRender,
    reset,
    setRootRender(fn: () => void) {
      rootRenderFn = fn;
    },
  };
});

const fetcherMocks = vi.hoisted(() => {
  const fetchers = new Map<
    string,
    {
      state: "idle" | "submitting" | "loading";
      data: any;
      submitCalls: Array<Record<string, string>>;
      pendingResolvers: Array<() => void>;
    }
  >();
  let rerender: (() => void) | null = null;

  return {
    fetchers,
    getOrCreate: (key = "default") => {
      let entry = fetchers.get(key);
      if (!entry) {
        entry = { state: "idle", data: undefined, submitCalls: [], pendingResolvers: [] };
        fetchers.set(key, entry);
      }
      return entry;
    },
    resolveEntry: (key: string) => {
      const entry = fetchers.get(key);
      if (!entry) return;
      for (const res of entry.pendingResolvers.splice(0)) res();
    },
    setRerender: (fn: (() => void) | null) => {
      rerender = fn;
    },
    triggerRerender: () => rerender?.(),
    reset: () => {
      for (const e of fetchers.values()) {
        for (const r of e.pendingResolvers) r();
      }
      fetchers.clear();
      rerender = null;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
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
    useFetchers: () => [],
    useFetcher: (opts?: { key?: string }) => {
      const entry = fetcherMocks.getOrCreate(opts?.key);
      return {
        get state() {
          return entry.state;
        },
        get data() {
          return entry.data;
        },
        submit: (target: Record<string, string>) => {
          entry.state = "submitting";
          entry.submitCalls.push({ ...target });
          fetcherMocks.triggerRerender();
          return new Promise<void>((resolve) => {
            entry.pendingResolvers.push(resolve);
          });
        },
      };
    },
  };
});

import { useSubtaskCompletionPrompt } from "../app/features/list/hooks/useSubtaskCompletionPrompt";
import { SubtaskCompletionModal } from "../app/features/list/components/SubtaskCompletionModal";
import { action as listAction } from "../app/features/list/action.server";
import { TodoManager } from "../app/to-do-manager";

function findElements(node: any, pred: (el: any) => boolean, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props?.children !== undefined) findElements(node.props.children, pred, out);
  return out;
}

function textOf(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props?.children !== undefined) return textOf(node.props.children);
  return "";
}

async function flushMicrotasks(rounds = 6) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

function makeTodo(overrides: Partial<Todo> & Pick<Todo, "id" | "text">): Todo {
  return {
    listId: "list-1",
    completed: false,
    createdAt: 1000,
    priority: "none",
    recurrence: "none",
    ...overrides,
  };
}

describe("web subtask completion prompt (#213)", () => {
  let todos: Todo[];
  let hookResult: ReturnType<typeof useSubtaskCompletionPrompt>;
  let onNotify: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let handleGuestAction: ReturnType<
    typeof vi.fn<(intent: string, payload?: GuestActionPayload) => void>
  >;

  function mount(initialTodos: Todo[], isLoggedIn = true) {
    todos = initialTodos.map((t) => ({ ...t }));
    const render = () => {
      hookResult = harness.runRender("useSubtaskCompletionPrompt", () =>
        useSubtaskCompletionPrompt({
          todos,
          isLoggedIn,
          handleGuestAction,
          onNotify,
        })
      );
      harness.flushEffects();
    };
    harness.setRootRender(render);
    fetcherMocks.setRerender(render);
    render();
    return { render };
  }

  beforeEach(() => {
    harness.reset();
    fetcherMocks.reset();
    onNotify = vi.fn();
    handleGuestAction = vi.fn();
  });

  afterEach(() => {
    harness.reset();
    fetcherMocks.reset();
  });

  it("completes parent and open subtasks optimistically on Yes and reverts both on failure", async () => {
    const parent = makeTodo({ id: "p1", text: "Parent" });
    const openSub = makeTodo({ id: "s1", text: "Open sub", parentId: "p1" });
    const doneSub = makeTodo({ id: "s2", text: "Done sub", parentId: "p1", completed: true });
    const deletingSub = makeTodo({ id: "s3", text: "Deleting sub", parentId: "p1", pendingDelete: true });

    const { render } = mount([parent, openSub, doneSub, deletingSub]);

    const intercepted = hookResult.maybePromptForCompletion(parent, true);
    expect(intercepted).toBe(true);
    expect(hookResult.promptState).toEqual({ todo: parent, incompleteCount: 1 });

    // Confirm Yes ("complete")
    hookResult.confirmSubtaskCompletion("complete");
    await flushMicrotasks();

    expect(hookResult.promptState).toBeNull();
    expect(hookResult.optimisticTodos.find((t) => t.id === "p1")?.completed).toBe(true);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s1")?.completed).toBe(true);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s2")?.completed).toBe(true);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s3")?.completed).toBe(false);

    const fetcherState = fetcherMocks.fetchers.get("todo-subtask-completion")!;
    expect(fetcherState.submitCalls[0]).toEqual({
      intent: "setCompleted",
      id: "p1",
      completed: "true",
      subtaskAction: "complete",
    });

    // Server write fails -> reverts parent and openSub together and shows error toast
    fetcherState.state = "idle";
    fetcherState.data = { error: "D1 unavailable" };
    fetcherMocks.resolveEntry("todo-subtask-completion");
    render();
    await flushMicrotasks();

    expect(hookResult.optimisticTodos.find((t) => t.id === "p1")?.completed).toBe(false);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s1")?.completed).toBe(false);
    expect(onNotify).toHaveBeenCalledWith(formatSaveError("D1 unavailable"));
    expect(onNotify.mock.calls[0][0]).toContain(ROLLBACK_ERROR_MESSAGE);
  });

  it("promotes open subtasks optimistically on No, keeps completed subtasks attached, and reverts on failure", async () => {
    const parent = makeTodo({ id: "p1", text: "Parent" });
    const openSub = makeTodo({ id: "s1", text: "Open sub", parentId: "p1" });
    const doneSub = makeTodo({ id: "s2", text: "Done sub", parentId: "p1", completed: true });

    const { render } = mount([parent, openSub, doneSub]);

    expect(hookResult.maybePromptForCompletion(parent, true)).toBe(true);
    hookResult.confirmSubtaskCompletion("promote");
    await flushMicrotasks();

    expect(hookResult.optimisticTodos.find((t) => t.id === "p1")?.completed).toBe(true);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s1")?.completed).toBe(false);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s1")?.parentId).toBeUndefined();
    expect(hookResult.optimisticTodos.find((t) => t.id === "s2")?.parentId).toBe("p1");

    const fetcherState = fetcherMocks.fetchers.get("todo-subtask-completion")!;
    expect(fetcherState.submitCalls[0]).toEqual({
      intent: "setCompleted",
      id: "p1",
      completed: "true",
      subtaskAction: "promote",
    });

    // Failure restores parent completed=false and openSub.parentId="p1"
    fetcherState.state = "idle";
    fetcherState.data = undefined;
    fetcherMocks.resolveEntry("todo-subtask-completion");
    render();
    await flushMicrotasks();

    expect(hookResult.optimisticTodos.find((t) => t.id === "p1")?.completed).toBe(false);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s1")?.parentId).toBe("p1");
    expect(onNotify).toHaveBeenCalledWith(ROLLBACK_ERROR_MESSAGE);
  });

  it("does nothing when Cancel is selected", async () => {
    const parent = makeTodo({ id: "p1", text: "Parent" });
    const openSub = makeTodo({ id: "s1", text: "Open sub", parentId: "p1" });
    mount([parent, openSub]);

    expect(hookResult.maybePromptForCompletion(parent, true)).toBe(true);
    hookResult.cancelSubtaskCompletion();
    await flushMicrotasks();

    expect(hookResult.promptState).toBeNull();
    expect(fetcherMocks.fetchers.get("todo-subtask-completion")?.submitCalls ?? []).toHaveLength(0);
    expect(hookResult.optimisticTodos.find((t) => t.id === "p1")?.completed).toBe(false);
    expect(hookResult.optimisticTodos.find((t) => t.id === "s1")?.parentId).toBe("p1");
  });

  it("skips prompt for no-prompt cases (no open subtasks, repeating, subtasks, pendingDelete, un-checking)", () => {
    const soloParent = makeTodo({ id: "solo", text: "Solo" });
    const onlyDoneSubParent = makeTodo({ id: "pdone", text: "Only Done Subs" });
    const doneSub = makeTodo({ id: "sdone", text: "Done Sub", parentId: "pdone", completed: true });
    const pendingSubParent = makeTodo({ id: "ppend", text: "Only Pending Delete" });
    const pendingSub = makeTodo({
      id: "spend",
      text: "Pending Sub",
      parentId: "ppend",
      pendingDelete: true,
    });
    const recurringParent = makeTodo({ id: "prec", text: "Daily", recurrence: "daily" });
    const recSub = makeTodo({ id: "srec", text: "Daily Sub", parentId: "prec" });
    const completedParent = makeTodo({ id: "pcomp", text: "Completed Parent", completed: true });

    mount([
      soloParent,
      onlyDoneSubParent,
      doneSub,
      pendingSubParent,
      pendingSub,
      recurringParent,
      recSub,
      completedParent,
    ]);

    expect(hookResult.maybePromptForCompletion(soloParent, true)).toBe(false);
    expect(hookResult.maybePromptForCompletion(onlyDoneSubParent, true)).toBe(false);
    expect(hookResult.maybePromptForCompletion(pendingSubParent, true)).toBe(false);
    expect(hookResult.maybePromptForCompletion(recurringParent, true)).toBe(false);
    expect(hookResult.maybePromptForCompletion(recSub, true)).toBe(false);
    expect(hookResult.maybePromptForCompletion(completedParent, false)).toBe(false);
    expect(hookResult.promptState).toBeNull();
  });

  it("passes subtaskAction through handleGuestAction for guest lists", async () => {
    const parent = makeTodo({ id: "p1", text: "Parent" });
    const openSub = makeTodo({ id: "s1", text: "Open sub", parentId: "p1" });
    mount([parent, openSub], false);

    hookResult.maybePromptForCompletion(parent, true);
    hookResult.confirmSubtaskCompletion("promote");
    await flushMicrotasks();

    expect(handleGuestAction).toHaveBeenCalledWith("setCompleted", {
      id: "p1",
      completed: true,
      subtaskAction: "promote",
    });
  });

  it("renders SubtaskCompletionModal with mobile-aligned copy and action buttons", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const expectedCopy = formatSubtaskCompletionPrompt(2);

    const tree = harness.runRender("modal", () =>
      SubtaskCompletionModal({
        prompt: { todo: makeTodo({ id: "p1", text: "Parent" }), incompleteCount: 2 },
        onConfirm,
        onCancel,
      })
    );
    harness.flushEffects();

    expect(textOf(tree)).toContain(expectedCopy.title);
    expect(textOf(tree)).toContain(expectedCopy.message);

    const buttons = findElements(tree, (el) => el.type === "button");
    const yesBtn = buttons.find((b) => textOf(b) === expectedCopy.completeLabel)!;
    const noBtn = buttons.find((b) => textOf(b) === expectedCopy.promoteLabel)!;
    const cancelBtn = buttons.find((b) => textOf(b) === expectedCopy.cancelLabel)!;

    yesBtn.props.onClick();
    noBtn.props.onClick();
    cancelBtn.props.onClick();

    expect(onConfirm).toHaveBeenNthCalledWith(1, "complete");
    expect(onConfirm).toHaveBeenNthCalledWith(2, "promote");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("server action handles subtaskAction='complete', 'promote', and rejects invalid values", async () => {
    const listId = `list-sub-${crypto.randomUUID()}`;
    const userId = "user-sub-1";
    await env.DB.prepare("INSERT INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(listId, "Subtask List", userId, Date.now())
      .run();

    const manager = new TodoManager(env.DB, listId);
    const parentComplete = await manager.create("Parent Complete");
    const openSubComplete = await manager.create("Sub Complete", "none", undefined, parentComplete.id);

    const parentPromote = await manager.create("Parent Promote");
    const openSubPromote = await manager.create("Sub Open Promote", "none", undefined, parentPromote.id);
    const doneSubPromote = await manager.create("Sub Done Keep", "none", undefined, parentPromote.id);
    await manager.setCompleted(doneSubPromote.id, true);

    const postSetCompleted = async (fields: Record<string, string>) => {
      const formData = new FormData();
      formData.set("intent", "setCompleted");
      for (const [k, v] of Object.entries(fields)) formData.set(k, v);
      const req = new Request(`http://localhost/${listId}`, {
        method: "POST",
        headers: {
          Cookie: `synx_auth_session=e2e_test_session:${userId}:sub@example.com`,
        },
        body: formData,
      });
      const res = await listAction({
        request: req,
        params: { id: listId },
        context: { cloudflare: { env: { ...env, ALLOW_DEV_TEST_AUTH: "true" } } },
      } as unknown as ActionFunctionArgs);
      return res instanceof Response
        ? { status: res.status, data: await res.json() }
        : { status: 200, data: res };
    };

    const invalidRes = await postSetCompleted({
      id: parentComplete.id,
      completed: "true",
      subtaskAction: "bogus",
    });
    expect(invalidRes.status).toBe(400);

    const completeRes = await postSetCompleted({
      id: parentComplete.id,
      completed: "true",
      subtaskAction: "complete",
    });
    expect(completeRes.status).toBe(200);
    const afterComplete = await manager.list();
    expect(afterComplete.find((t) => t.id === parentComplete.id)?.completed).toBe(true);
    expect(afterComplete.find((t) => t.id === openSubComplete.id)?.completed).toBe(true);

    const promoteRes = await postSetCompleted({
      id: parentPromote.id,
      completed: "true",
      subtaskAction: "promote",
    });
    expect(promoteRes.status).toBe(200);
    const afterPromote = await manager.list();
    expect(afterPromote.find((t) => t.id === parentPromote.id)?.completed).toBe(true);
    expect(afterPromote.find((t) => t.id === openSubPromote.id)?.parentId).toBeUndefined();
    expect(afterPromote.find((t) => t.id === openSubPromote.id)?.completed).toBe(false);
    expect(afterPromote.find((t) => t.id === doneSubPromote.id)?.parentId).toBe(parentPromote.id);
  });
});
