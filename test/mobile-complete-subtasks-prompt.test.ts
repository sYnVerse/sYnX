import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "../mobile/node_modules/@tanstack/react-query/build/modern/index.js";
import {
  applySetCompletedWithSubtasksLocal,
  formatSubtaskCompletionPrompt,
  getIncompleteSubtasks,
  shouldPromptSubtaskCompletion,
  type TodoItem,
} from "../shared";

const mocks = vi.hoisted(() => {
  let stateIndex = 0;
  const states: any[] = [];
  let refIndex = 0;
  const refs: { current: any }[] = [];
  return {
    resetState: () => {
      stateIndex = 0;
      states.length = 0;
      refIndex = 0;
      refs.length = 0;
    },
    reactMod: {
      createContext: (defaultValue?: any) => ({
        Provider: () => null,
        Consumer: () => null,
        _currentValue: defaultValue,
      }),
      useContext: (ctx: any) => ctx?._currentValue,
      useState: (initial: any) => {
        const idx = stateIndex++;
        if (!(idx in states)) {
          states[idx] = typeof initial === "function" ? initial() : initial;
        }
        const setState = (next: any) => {
          states[idx] = typeof next === "function" ? next(states[idx]) : next;
        };
        return [states[idx], setState];
      },
      useRef: (initial: any) => {
        const idx = refIndex++;
        if (!(idx in refs)) {
          refs[idx] = { current: initial };
        }
        return refs[idx];
      },
      useEffect: () => {},
      useCallback: (fn: any) => fn,
    },
    queryClient: null as unknown as QueryClient,
    lastMutationPromise: Promise.resolve(),
    alertCalls: [] as { title: string; message?: string; buttons?: any[]; options?: any }[],
    apiPost: vi.fn<(...args: any[]) => Promise<{ data: any }>>(),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    syncCalendar: vi.fn(async () => {}),
    reactNativeMod: {
      Platform: { OS: "ios" },
      Alert: {
        alert: vi.fn((title: string, message?: string, buttons?: any[], options?: any) => {
          mocks.alertCalls.push({ title, message, buttons, options });
        }),
      },
    },
    rqOverrides: {
      useQueryClient: () => mocks.queryClient,
      useMutation: (opts: any) => ({
        mutate: (vars: any) => {
          const run = async () => {
            const ctx = await opts.onMutate?.(vars);
            try {
              const data = await opts.mutationFn(vars);
              await opts.onSuccess?.(data, vars, ctx);
            } catch (err) {
              await opts.onError?.(err, vars, ctx);
            } finally {
              await opts.onSettled?.(undefined, null, vars, ctx);
            }
          };
          mocks.lastMutationPromise = run();
        },
      }),
    },
  };
});

vi.mock("react", () => mocks.reactMod);
vi.mock("../mobile/node_modules/react", () => mocks.reactMod);
vi.mock("../mobile/node_modules/react/index.js", () => mocks.reactMod);
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../mobile/node_modules/@tanstack/react-query/build/modern/index.js"
  );
  return { ...actual, ...mocks.rqOverrides };
});
vi.mock("../mobile/node_modules/@tanstack/react-query", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../mobile/node_modules/@tanstack/react-query/build/modern/index.js"
  );
  return { ...actual, ...mocks.rqOverrides };
});
vi.mock("../mobile/node_modules/@tanstack/react-query/build/modern/index.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../mobile/node_modules/@tanstack/react-query/build/modern/index.js"
  );
  return { ...actual, ...mocks.rqOverrides };
});
vi.mock("react-native", () => mocks.reactNativeMod);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNativeMod);
vi.mock("../mobile/node_modules/react-native/index.js", () => mocks.reactNativeMod);
vi.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "Success", Error: "Error" },
  notificationAsync: vi.fn(async () => {}),
}));
vi.mock("../mobile/node_modules/expo-haptics", () => ({
  NotificationFeedbackType: { Success: "Success", Error: "Error" },
  notificationAsync: vi.fn(async () => {}),
}));
vi.mock("../mobile/src/api/client", () => ({
  apiClient: { post: mocks.apiPost },
}));
vi.mock("../mobile/src/context/ToastContext", () => ({
  useToast: () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }),
}));
vi.mock("../mobile/src/context/ThemeContext", () => ({
  useTheme: () => ({ hapticsEnabled: false }),
}));
vi.mock("../mobile/src/services/calendar", () => ({
  syncTaskToNativeCalendar: mocks.syncCalendar,
}));
vi.mock("../mobile/src/services/listNames", () => ({
  getCachedListName: () => "Inbox",
}));

import { useSetTodoCompleted } from "../mobile/src/hooks/useSetTodoCompleted";

function makeTodo(overrides: Partial<TodoItem> & Pick<TodoItem, "id">): TodoItem {
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

describe("complete subtasks prompt (#204)", () => {
  beforeEach(() => {
    mocks.resetState();
    mocks.queryClient = new QueryClient();
    mocks.lastMutationPromise = Promise.resolve();
    mocks.alertCalls = [];
    mocks.apiPost.mockReset();
    mocks.showError.mockReset();
    mocks.showSuccess.mockReset();
    mocks.syncCalendar.mockClear();
    mocks.reactNativeMod.Alert.alert.mockClear();
  });

  it("prompts only when checking off a non-recurring parent with incomplete subtasks", () => {
    const parent = makeTodo({ id: "p-1", text: "Plan trip" });
    const openSub = makeTodo({ id: "s-1", parentId: "p-1", completed: false });
    const doneSub = makeTodo({ id: "s-2", parentId: "p-1", completed: true });
    const allTodos = [parent, openSub, doneSub];

    expect(getIncompleteSubtasks(parent, allTodos).map((t) => t.id)).toEqual(["s-1"]);
    expect(shouldPromptSubtaskCompletion(parent, true, allTodos)).toBe(true);

    // No prompt when un-checking, recurring, already completed, or checking a subtask
    expect(shouldPromptSubtaskCompletion(parent, false, allTodos)).toBe(false);
    expect(
      shouldPromptSubtaskCompletion({ ...parent, recurrence: "daily" }, true, allTodos)
    ).toBe(false);
    expect(shouldPromptSubtaskCompletion({ ...parent, completed: true }, true, allTodos)).toBe(
      false
    );
    expect(shouldPromptSubtaskCompletion(openSub, true, allTodos)).toBe(false);

    // No prompt when all subtasks are already completed
    expect(shouldPromptSubtaskCompletion(parent, true, [parent, doneSub])).toBe(false);

    const copy = formatSubtaskCompletionPrompt(2);
    expect(copy.title).toBe("Complete subtasks too?");
    expect(copy.message).toContain("2 incomplete subtasks");
  });

  it("optimistically completes or promotes open subtasks right after the completed parent", () => {
    const other = makeTodo({ id: "other", text: "Unrelated task" });
    const parent = makeTodo({ id: "p-1", text: "Ship release" });
    const openSub1 = makeTodo({ id: "s-1", parentId: "p-1", text: "Sub 1", durationMinutes: 15 });
    const openSub2 = makeTodo({ id: "s-2", parentId: "p-1", text: "Sub 2" });
    const doneSub = makeTodo({ id: "s-3", parentId: "p-1", text: "Done sub", completed: true });
    const cached = [other, parent, openSub1, openSub2, doneSub];

    const completedAll = applySetCompletedWithSubtasksLocal(cached, "p-1", true, "complete")!;
    expect(completedAll.find((t) => t.id === "p-1")?.completed).toBe(true);
    expect(completedAll.find((t) => t.id === "s-1")?.completed).toBe(true);
    expect(completedAll.find((t) => t.id === "s-2")?.completed).toBe(true);
    expect(completedAll.find((t) => t.id === "s-1")?.parentId).toBe("p-1");

    const promoted = applySetCompletedWithSubtasksLocal(cached, "p-1", true, "promote")!;
    expect(promoted.map((t) => t.id)).toEqual(["other", "p-1", "s-1", "s-2", "s-3"]);
    expect(promoted.find((t) => t.id === "p-1")?.completed).toBe(true);
    expect(promoted.find((t) => t.id === "s-1")?.parentId).toBeUndefined();
    expect(promoted.find((t) => t.id === "s-1")?.completed).toBe(false);
    expect(promoted.find((t) => t.id === "s-1")?.durationMinutes).toBe(15);
    expect(promoted.find((t) => t.id === "s-3")?.parentId).toBe("p-1");
    expect(promoted.find((t) => t.id === "s-3")?.completed).toBe(true);
  });

  it("handles Yes, No, Cancel, and no-prompt flows inside useSetTodoCompleted", async () => {
    const parent = makeTodo({ id: "p-1", text: "Errands" });
    const openSub = makeTodo({ id: "s-1", parentId: "p-1", text: "Buy milk" });
    const doneSub = makeTodo({ id: "s-2", parentId: "p-1", text: "List items", completed: true });
    const solo = makeTodo({ id: "solo", text: "Solo task" });

    mocks.queryClient.setQueryData(["todos", "list-1"], [parent, openSub, doneSub, solo]);
    const { setCompleted } = useSetTodoCompleted("list-1");

    // 1. Solo task (no subtasks) skips Alert and calls API immediately
    mocks.apiPost.mockResolvedValueOnce({
      data: { todo: { ...solo, completed: true }, rescheduled: false, updatedSubtasks: [] },
    });
    setCompleted(solo);
    await mocks.lastMutationPromise;
    expect(mocks.alertCalls).toHaveLength(0);
    expect(mocks.apiPost).toHaveBeenCalledWith("/api/v1/todos/solo/completed", {
      completed: true,
    });

    // 2. Parent with incomplete subtask shows prompt; Cancel makes no API call or cache change
    mocks.apiPost.mockClear();
    setCompleted(parent);
    expect(mocks.alertCalls).toHaveLength(1);
    expect(mocks.apiPost).not.toHaveBeenCalled();

    const firstAlertButtons = mocks.alertCalls[0].buttons!;
    const cancelBtn = firstAlertButtons.find((b) => b.style === "cancel");
    cancelBtn.onPress?.();
    await mocks.lastMutationPromise;
    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(
      mocks.queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])?.find((t) => t.id === "p-1")
        ?.completed
    ).toBe(false);

    // 3. Picking Yes completes parent + open subtasks
    mocks.apiPost.mockResolvedValueOnce({
      data: {
        todo: { ...parent, completed: true },
        rescheduled: false,
        updatedSubtasks: [{ ...openSub, completed: true }],
      },
    });
    const yesBtn = firstAlertButtons.find((b) => b.text === "Yes, complete all");
    yesBtn.onPress();
    await mocks.lastMutationPromise;
    expect(mocks.apiPost).toHaveBeenCalledWith("/api/v1/todos/p-1/completed", {
      completed: true,
      subtaskAction: "complete",
    });
    const afterYes = mocks.queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])!;
    expect(afterYes.find((t) => t.id === "p-1")?.completed).toBe(true);
    expect(afterYes.find((t) => t.id === "s-1")?.completed).toBe(true);

    // 4. Picking No promotes open subtasks and clears parentId in cache
    mocks.queryClient.setQueryData(["todos", "list-1"], [parent, openSub, doneSub]);
    mocks.apiPost.mockResolvedValueOnce({
      data: {
        todo: { ...parent, completed: true },
        rescheduled: false,
        // Simulate server JSON omitting parentId when parent_id IS NULL
        updatedSubtasks: [{ ...openSub, parentId: undefined }],
      },
    });
    setCompleted(parent);
    expect(mocks.alertCalls).toHaveLength(2);
    const noBtn = mocks.alertCalls[1].buttons!.find((b) => b.text === "No, keep open");
    noBtn.onPress();
    await mocks.lastMutationPromise;
    expect(mocks.apiPost).toHaveBeenCalledWith("/api/v1/todos/p-1/completed", {
      completed: true,
      subtaskAction: "promote",
    });
    const afterNo = mocks.queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])!;
    expect(afterNo.find((t) => t.id === "p-1")?.completed).toBe(true);
    expect(afterNo.find((t) => t.id === "s-1")?.parentId).toBeUndefined();
    expect(afterNo.find((t) => t.id === "s-1")?.completed).toBe(false);
    expect(afterNo.find((t) => t.id === "s-2")?.parentId).toBe("p-1");
  });

  it("rolls back both parent and subtasks and notifies the user when subtaskAction fails", async () => {
    const parent = makeTodo({ id: "p-1", text: "Errands" });
    const openSub = makeTodo({ id: "s-1", parentId: "p-1", text: "Buy milk" });
    mocks.queryClient.setQueryData(["todos", "list-1"], [parent, openSub]);
    mocks.apiPost.mockRejectedValueOnce(new Error("Network offline"));

    const { setCompleted } = useSetTodoCompleted("list-1");
    setCompleted(parent);
    expect(mocks.alertCalls).toHaveLength(1);
    const noBtn = mocks.alertCalls[0].buttons!.find((b) => b.text === "No, keep open");
    noBtn.onPress();
    await mocks.lastMutationPromise;

    const rolledBack = mocks.queryClient.getQueryData<TodoItem[]>(["todos", "list-1"])!;
    expect(rolledBack.find((t) => t.id === "p-1")?.completed).toBe(false);
    expect(rolledBack.find((t) => t.id === "s-1")?.parentId).toBe("p-1");
    expect(rolledBack.find((t) => t.id === "s-1")?.completed).toBe(false);
    expect(mocks.showError).toHaveBeenCalledWith("Couldn't save, change undone: Network offline");
  });
});
