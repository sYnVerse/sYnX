import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "../mobile/node_modules/@tanstack/react-query/build/modern/index.js";
import type { TodoItem } from "../shared";
import { computeQuickAddFormState } from "../mobile/src/utils/quickAddForm";

const storageBacking = vi.hoisted(() => new Map<string, string>());

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
      useSyncExternalStore: (sub: any, snap: any) => snap(),
    },
    asyncStorageMod: {
      default: {
        getItem: vi.fn(async (k: string) => storageBacking.get(k) ?? null),
        setItem: vi.fn(async (k: string, v: string) => {
          storageBacking.set(k, v);
        }),
      },
      getItem: vi.fn(async (k: string) => storageBacking.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        storageBacking.set(k, v);
      }),
    },
    queryClient: null as unknown as QueryClient,
    lastMutationPromise: Promise.resolve(),
    apiPost: vi.fn<(...args: any[]) => Promise<{ data: any }>>(),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showToast: vi.fn(),
    syncCalendar: vi.fn(async () => null),
    reactNativeMod: {
      Platform: { OS: "android" },
      Alert: { alert: vi.fn() },
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
vi.mock("@react-native-async-storage/async-storage", () => mocks.asyncStorageMod);
vi.mock(
  "../mobile/node_modules/@react-native-async-storage/async-storage",
  () => mocks.asyncStorageMod
);
vi.mock(
  "../mobile/node_modules/@react-native-async-storage/async-storage/lib/commonjs/index.js",
  () => mocks.asyncStorageMod
);
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
  useToast: () => ({
    showError: mocks.showError,
    showSuccess: mocks.showSuccess,
    showToast: mocks.showToast,
  }),
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

import {
  STORAGE_KEY_SMART_QUICK_ADD,
  getSmartQuickAddEnabled,
  loadQuickAddPreferences,
  resetQuickAddPreferencesForTest,
  setSmartQuickAddEnabled,
} from "../mobile/src/services/quickAddPreferences";
import { useSetTodoCompleted } from "../mobile/src/hooks/useSetTodoCompleted";

const NOV_16_10AM_UTC = Date.UTC(2026, 10, 16, 10, 0, 0, 0);

function makeTodo(overrides: Partial<TodoItem> & Pick<TodoItem, "id">): TodoItem {
  return {
    listId: "list-1",
    text: `Task ${overrides.id}`,
    completed: false,
    createdAt: NOV_16_10AM_UTC,
    priority: "none",
    reminderSent: false,
    recurrence: "none",
    ...overrides,
  };
}

describe("Issue #104 mobile behavior", () => {
  beforeEach(() => {
    mocks.resetState();
    mocks.queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.apiPost.mockReset();
    mocks.showError.mockReset();
    mocks.showSuccess.mockReset();
    mocks.showToast.mockReset();
    mocks.syncCalendar.mockReset();
    mocks.syncCalendar.mockResolvedValue(null);
    storageBacking.clear();
    resetQuickAddPreferencesForTest();
  });

  it("persists Smart Quick Add preference (default true) and saves text literally when off", async () => {
    await loadQuickAddPreferences();
    expect(getSmartQuickAddEnabled()).toBe(true);

    await setSmartQuickAddEnabled(false);
    expect(getSmartQuickAddEnabled()).toBe(false);
    expect(storageBacking.get(STORAGE_KEY_SMART_QUICK_ADD)).toBe("false");

    // Simulated reload reads persisted "false" from AsyncStorage
    resetQuickAddPreferencesForTest();
    expect(getSmartQuickAddEnabled()).toBe(true);
    await loadQuickAddPreferences();
    expect(getSmartQuickAddEnabled()).toBe(false);

    const disabledState = computeQuickAddFormState({
      text: "Pay rent tomorrow 3pm !high for 20m",
      isEditing: false,
      smartEnabled: getSmartQuickAddEnabled(),
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(disabledState.effectiveTitle).toBe("Pay rent tomorrow 3pm !high for 20m");
    expect(disabledState.effectivePriority).toBe("none");
    expect(disabledState.effectiveRecurrence).toBe("none");
    expect(disabledState.effectiveDurationText).toBe("");
    expect(disabledState.hasParsedReminder).toBe(false);
    expect(disabledState.chips).toEqual([]);
  });

  it("offers duration quick picks after untimed check-off and records 30m completion duration", async () => {
    const task = makeTodo({ id: "t-untimed", text: "Fold laundry" });
    mocks.queryClient.setQueryData(["todos", "list-1"], [task]);
    const invalidateSpy = vi.spyOn(mocks.queryClient, "invalidateQueries");

    mocks.apiPost.mockResolvedValueOnce({
      data: {
        todo: { ...task, completed: true },
        rescheduled: false,
        completion: { id: "comp-untimed-1", durationSeconds: null },
      },
    });

    const hook = useSetTodoCompleted("list-1");
    hook.setCompleted(task, true);
    await mocks.lastMutationPromise;

    expect(mocks.showToast).toHaveBeenCalledTimes(1);
    const [message, tone, options] = mocks.showToast.mock.calls[0];
    expect(message).toBe("How long did it take?");
    expect(tone).toBe("info");
    expect(options.actions.map((a: any) => a.label)).toEqual(["15m", "30m", "1h", "Skip"]);

    mocks.apiPost.mockResolvedValueOnce({
      data: { success: true, completion: { id: "comp-untimed-1", durationSeconds: 1800 } },
    });
    const pick30 = options.actions.find((a: any) => a.label === "30m");
    pick30.onPress();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();

    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/v1/completions/comp-untimed-1/duration",
      { durationMinutes: 30 }
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["todo-completions", "t-untimed"],
    });
    expect(mocks.showSuccess).toHaveBeenCalledWith("Logged 30m");
  });

  it("offers Undo on repeat completion and calls syncTaskToNativeCalendar when undone", async () => {
    const originalReminder = NOV_16_10AM_UTC - 60_000;
    const nextReminder = originalReminder + 24 * 3600_000;
    const recurring = makeTodo({
      id: "t-repeat",
      text: "Stretch",
      recurrence: "daily",
      reminderAt: originalReminder,
      reminderSent: true,
    });
    mocks.queryClient.setQueryData(["todos", "list-1"], [recurring]);
    const invalidateSpy = vi.spyOn(mocks.queryClient, "invalidateQueries");

    mocks.apiPost.mockResolvedValueOnce({
      data: {
        todo: { ...recurring, reminderAt: nextReminder, reminderSent: false },
        rescheduled: true,
        completion: { id: "comp-repeat-1", durationSeconds: 300 },
      },
    });

    const hook = useSetTodoCompleted("list-1");
    hook.setCompleted(recurring, true);
    await mocks.lastMutationPromise;

    expect(mocks.showSuccess).toHaveBeenCalledTimes(1);
    const [, options] = mocks.showSuccess.mock.calls[0];
    expect(options.actions.map((a: any) => a.label)).toEqual(["Undo"]);

    mocks.apiPost.mockResolvedValueOnce({
      data: {
        success: true,
        undone: true,
        todo: { ...recurring, reminderAt: originalReminder, reminderSent: true },
      },
    });
    mocks.syncCalendar.mockClear();

    const undoAction = options.actions[0];
    await undoAction.onPress();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.apiPost).toHaveBeenCalledWith("/api/v1/todos/t-repeat/undo-repeat", {
      completionId: "comp-repeat-1",
    });
    const updatedList = mocks.queryClient.getQueryData<TodoItem[]>(["todos", "list-1"]);
    const restored = updatedList?.find((t) => t.id === "t-repeat");
    expect(restored?.reminderAt).toBe(originalReminder);
    expect(restored?.reminderSent).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["todo-completions", "t-repeat"],
    });
    expect(mocks.syncCalendar).toHaveBeenCalledTimes(1);
    expect(mocks.syncCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t-repeat", reminderAt: originalReminder, reminderSent: true }),
      { listName: "Inbox" }
    );
  });
});
