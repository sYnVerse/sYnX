import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "../mobile/node_modules/@tanstack/react-query/build/modern/index.js";
import appSource from "../mobile/App.tsx?raw";
import bgTaskSource from "../mobile/src/services/widgetBackgroundTask.ts?raw";
import serverSource from "../server.ts?raw";

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const definedTasks = new Map<string, (...args: any[]) => any>();
  const responseListeners: ((response: any) => void)[] = [];
  const appStateListeners: ((state: string) => void)[] = [];

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

  const notifications = {
    AndroidImportance: { HIGH: 4, NONE: 0 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
    DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
    setNotificationHandler: vi.fn(),
    setNotificationChannelAsync: vi.fn(async () => ({})),
    setNotificationCategoryAsync: vi.fn(async () => ({})),
    getPermissionsAsync: vi.fn(async () => ({ status: "granted", canAskAgain: true })),
    scheduleNotificationAsync: vi.fn(async () => "notif-id"),
    cancelScheduledNotificationAsync: vi.fn(async () => {}),
    dismissNotificationAsync: vi.fn(async () => {}),
    registerTaskAsync: vi.fn(async () => null),
    addNotificationResponseReceivedListener: vi.fn((cb: (r: any) => void) => {
      responseListeners.push(cb);
      return {
        remove: vi.fn(() => {
          const idx = responseListeners.indexOf(cb);
          if (idx >= 0) responseListeners.splice(idx, 1);
        }),
      };
    }),
  };

  const taskManager = {
    defineTask: vi.fn((name: string, fn: (...args: any[]) => any) => {
      definedTasks.set(name, fn);
    }),
  };

  const reactNative = {
    Platform: { OS: "android" },
    Linking: { openSettings: vi.fn(async () => {}) },
    AppState: {
      addEventListener: vi.fn((_: string, cb: (s: string) => void) => {
        appStateListeners.push(cb);
        return {
          remove: vi.fn(() => {
            const idx = appStateListeners.indexOf(cb);
            if (idx >= 0) appStateListeners.splice(idx, 1);
          }),
        };
      }),
    },
  };

  const secureStore = {
    getItemAsync: vi.fn(async () => null),
    setItemAsync: vi.fn(async () => {}),
    deleteItemAsync: vi.fn(async () => {}),
  };

  const client = {
    DEVICE_PUSH_TOKEN_KEY: "synx_device_push_token",
    apiClient: {
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };

  const calendar = {
    syncTaskToNativeCalendar: vi.fn(async () => null),
    reconcileTasksWithNativeCalendar: vi.fn(async () => 0),
  };

  const widgetSync = {
    syncAllWidgets: vi.fn(async () => {}),
  };

  const listNames = {
    getCachedListName: vi.fn(() => "Work"),
  };

  return {
    storage,
    definedTasks,
    responseListeners,
    appStateListeners,
    asyncStorage,
    notifications,
    taskManager,
    reactNative,
    secureStore,
    client,
    calendar,
    widgetSync,
    listNames,
  };
});

vi.mock("@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("expo-notifications", () => mocks.notifications);
vi.mock("../mobile/node_modules/expo-notifications", () => mocks.notifications);
vi.mock("expo-task-manager", () => mocks.taskManager);
vi.mock("../mobile/node_modules/expo-task-manager", () => mocks.taskManager);
vi.mock("expo-secure-store", () => mocks.secureStore);
vi.mock("../mobile/node_modules/expo-secure-store", () => mocks.secureStore);
vi.mock("react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNative);
vi.mock("../mobile/src/api/client", () => mocks.client);
vi.mock("../mobile/src/services/calendar", () => mocks.calendar);
vi.mock("../mobile/src/services/widgetSync", () => mocks.widgetSync);
vi.mock("../mobile/src/services/listNames", () => mocks.listNames);

import {
  DEFAULT_REMINDER_SNOOZE_MS,
  REMINDER_ACTION_COMPLETE,
  REMINDER_ACTION_SNOOZE,
  REMINDER_NOTIFICATION_CATEGORY,
  computeSnoozedReminderAt,
  extractReminderNotificationActionPayload,
  reminderNotificationIdentifier,
  type TodoItem,
} from "../shared";
import {
  REMINDER_NOTIFICATION_TASK,
  SYNX_PENDING_NOTIFICATION_OPS_KEY,
  drainAndReplayPendingNotificationOps,
  ensureReminderNotificationCategory,
  handleReminderNotificationAction,
  resetNotificationActionDedupForTests,
  startNotificationResponseService,
} from "../mobile/src/services/notifications";

describe("mobile reminder notification Complete & Snooze actions (#110)", () => {
  beforeEach(() => {
    mocks.storage.clear();
    mocks.responseListeners.length = 0;
    mocks.appStateListeners.length = 0;
    resetNotificationActionDedupForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the reminder category with Complete and Snooze non-foreground actions", async () => {
    await ensureReminderNotificationCategory();

    expect(mocks.notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      REMINDER_NOTIFICATION_CATEGORY,
      [
        {
          identifier: REMINDER_ACTION_COMPLETE,
          buttonTitle: "Complete",
          options: { opensAppToForeground: false, isAuthenticationRequired: false },
        },
        {
          identifier: REMINDER_ACTION_SNOOZE,
          buttonTitle: "Snooze",
          options: { opensAppToForeground: false, isAuthenticationRequired: false },
        },
      ]
    );
  });

  it("extracts action payloads from both interactive NotificationResponse and Android dataString bundles", () => {
    const interactive = extractReminderNotificationActionPayload({
      actionIdentifier: REMINDER_ACTION_COMPLETE,
      notification: {
        date: 1_700_000_000_000,
        request: {
          identifier: "reminder_todo-1",
          content: {
            title: "Work",
            body: "Submit report",
            data: { todoId: "todo-1", listId: "list-1" },
          },
        },
      },
    });
    expect(interactive).toEqual({
      actionIdentifier: REMINDER_ACTION_COMPLETE,
      notificationId: "reminder_todo-1",
      todoId: "todo-1",
      listId: "list-1",
      title: "Work",
      body: "Submit report",
    });

    const fromDataString = extractReminderNotificationActionPayload({
      actionIdentifier: REMINDER_ACTION_SNOOZE,
      notification: {
        date: 1_700_000_005_000,
        request: {
          identifier: "reminder_todo-2",
          content: {
            title: "Home",
            body: "Call vet",
            dataString: JSON.stringify({ listId: "list-2" }),
          },
        },
      },
    });
    expect(fromDataString).toEqual({
      actionIdentifier: REMINDER_ACTION_SNOOZE,
      notificationId: "reminder_todo-2",
      todoId: "todo-2",
      listId: "list-2",
      title: "Home",
      body: "Call vet",
    });

    const defaultTap = extractReminderNotificationActionPayload({
      actionIdentifier: mocks.notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        request: {
          identifier: "reminder_todo-1",
          content: { data: { todoId: "todo-1", listId: "list-1" } },
        },
      },
    });
    expect(defaultTap).toBeNull();
  });

  it("handles Complete action online without opening the app, updating cache, calendar, and widgets", async () => {
    const qc = new QueryClient();
    const initialTodo: TodoItem = {
      id: "todo-1",
      listId: "list-1",
      text: "Submit report",
      completed: false,
      createdAt: 1000,
      priority: "high",
      reminderAt: 2000,
      reminderSent: true,
      recurrence: "none",
    };
    const updatedTodo: TodoItem = { ...initialTodo, completed: true };
    qc.setQueryData(["todos", "list-1"], [initialTodo]);

    mocks.client.apiClient.post.mockResolvedValueOnce({
      data: { success: true, todo: updatedTodo, rescheduled: false },
    });

    const handled = await handleReminderNotificationAction(
      {
        actionIdentifier: REMINDER_ACTION_COMPLETE,
        notification: {
          date: 1_700_000_010_000,
          request: {
            identifier: reminderNotificationIdentifier("todo-1"),
            content: {
              title: "Work",
              body: "Submit report",
              data: { todoId: "todo-1", listId: "list-1" },
            },
          },
        },
      },
      qc
    );

    expect(handled).toBe(true);
    expect(mocks.notifications.dismissNotificationAsync).toHaveBeenCalledWith("reminder_todo-1");
    expect(mocks.notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("todo-1");
    expect(mocks.notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("reminder_todo-1");
    expect(mocks.client.apiClient.post).toHaveBeenCalledWith("/api/v1/todos/todo-1/completed", {
      completed: true,
    });
    expect(qc.getQueryData<TodoItem[]>(["todos", "list-1"])?.[0].completed).toBe(true);
    expect(mocks.calendar.syncTaskToNativeCalendar).toHaveBeenCalledWith(updatedTodo, {
      listName: "Work",
    });
    expect(mocks.widgetSync.syncAllWidgets).toHaveBeenCalledWith(qc);
    expect(mocks.storage.has(SYNX_PENDING_NOTIFICATION_OPS_KEY)).toBe(false);
  });

  it("queues offline Complete actions and replays them when reconnected", async () => {
    mocks.client.apiClient.post.mockRejectedValueOnce(new Error("Network Error"));

    const handled = await handleReminderNotificationAction({
      actionIdentifier: REMINDER_ACTION_COMPLETE,
      notification: {
        date: 1_700_000_020_000,
        request: {
          identifier: "reminder_todo-offline",
          content: {
            title: "Work",
            body: "Offline task",
            data: { todoId: "todo-offline", listId: "list-1" },
          },
        },
      },
    });

    expect(handled).toBe(true);
    const queuedRaw = mocks.storage.get(SYNX_PENDING_NOTIFICATION_OPS_KEY);
    expect(queuedRaw).toBeDefined();
    expect(JSON.parse(queuedRaw!)).toMatchObject([
      { kind: "complete", todoId: "todo-offline", listId: "list-1", completed: true },
    ]);

    const serverTodo: TodoItem = {
      id: "todo-offline",
      listId: "list-1",
      text: "Offline task",
      completed: true,
      createdAt: 1000,
      priority: "none",
      reminderSent: true,
      recurrence: "none",
    };
    mocks.client.apiClient.post.mockResolvedValueOnce({
      data: { success: true, todo: serverTodo, rescheduled: false },
    });

    const qc = new QueryClient();
    await drainAndReplayPendingNotificationOps(qc);

    expect(mocks.client.apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/todos/todo-offline/completed",
      { completed: true }
    );
    expect(mocks.storage.has(SYNX_PENDING_NOTIFICATION_OPS_KEY)).toBe(false);
    expect(mocks.calendar.reconcileTasksWithNativeCalendar).toHaveBeenCalledWith(
      [serverTodo],
      expect.any(Function)
    );
    expect(mocks.widgetSync.syncAllWidgets).toHaveBeenCalledWith(qc);
  });

  it("handles Snooze online (10 minutes) and offline replay including overdue mark-reminder-sent", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const expectedSnoozeAt = computeSnoozedReminderAt(1_700_000_000_000);
    expect(expectedSnoozeAt).toBe(1_700_000_000_000 + DEFAULT_REMINDER_SNOOZE_MS);

    mocks.client.apiClient.put.mockResolvedValueOnce({
      data: {
        success: true,
        todo: {
          id: "todo-snooze",
          listId: "list-1",
          text: "Water plants",
          completed: false,
          createdAt: 1000,
          priority: "low",
          reminderAt: expectedSnoozeAt,
          reminderSent: false,
          recurrence: "none",
        },
      },
    });

    const qc = new QueryClient();
    await handleReminderNotificationAction(
      {
        actionIdentifier: REMINDER_ACTION_SNOOZE,
        notification: {
          date: 1_700_000_000_000,
          request: {
            identifier: "reminder_todo-snooze",
            content: {
              title: "Home",
              body: "Water plants",
              data: { todoId: "todo-snooze", listId: "list-1" },
            },
          },
        },
      },
      qc
    );

    expect(mocks.notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "reminder_todo-snooze",
        content: expect.objectContaining({
          title: "Home",
          body: "Water plants",
          categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
          data: expect.objectContaining({ todoId: "todo-snooze", listId: "list-1" }),
        }),
        trigger: expect.objectContaining({
          date: new Date(expectedSnoozeAt),
        }),
      })
    );
    expect(mocks.client.apiClient.put).toHaveBeenCalledWith("/api/v1/todos/todo-snooze", {
      reminderAt: expectedSnoozeAt,
    });

    // Now test offline snooze that replays after the 10-minute snooze timestamp already passed
    resetNotificationActionDedupForTests();
    nowSpy.mockReturnValue(1_700_000_100_000);
    const offlineSnoozeAt = computeSnoozedReminderAt(1_700_000_100_000);
    mocks.client.apiClient.put.mockRejectedValueOnce(new Error("Offline"));

    await handleReminderNotificationAction({
      actionIdentifier: REMINDER_ACTION_SNOOZE,
      notification: {
        date: 1_700_000_100_000,
        request: {
          identifier: "reminder_todo-snooze-offline",
          content: {
            title: "Home",
            body: "Offline snooze",
            data: { todoId: "todo-snooze-offline", listId: "list-1" },
          },
        },
      },
    });

    expect(mocks.notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mocks.storage.has(SYNX_PENDING_NOTIFICATION_OPS_KEY)).toBe(true);

    // Advance time past offlineSnoozeAt when connectivity returns
    nowSpy.mockReturnValue(offlineSnoozeAt + 60_000);
    const snoozedServerTodo: TodoItem = {
      id: "todo-snooze-offline",
      listId: "list-1",
      text: "Offline snooze",
      completed: false,
      createdAt: 1000,
      priority: "none",
      reminderAt: offlineSnoozeAt,
      reminderSent: true,
      recurrence: "none",
    };
    mocks.client.apiClient.put.mockResolvedValueOnce({
      data: { success: true, todo: { ...snoozedServerTodo, reminderSent: false } },
    });
    mocks.client.apiClient.post.mockResolvedValueOnce({
      data: { success: true, todo: snoozedServerTodo },
    });

    await drainAndReplayPendingNotificationOps(qc);

    expect(mocks.client.apiClient.put).toHaveBeenLastCalledWith("/api/v1/todos/todo-snooze-offline", {
      reminderAt: offlineSnoozeAt,
    });
    expect(mocks.client.apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/todos/todo-snooze-offline/mark-reminder-sent"
    );
    expect(mocks.storage.has(SYNX_PENDING_NOTIFICATION_OPS_KEY)).toBe(false);
  });

  it("snoozes a repeating task locally without shifting server or cached recurrence time when later completed", async () => {
    const nineAm = Date.UTC(2026, 10, 14, 9, 0, 0);
    const nineTenAm = Date.UTC(2026, 10, 14, 9, 10, 0);
    const nextDayNineAm = Date.UTC(2026, 10, 15, 9, 0, 0);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(nineAm);

    const qc = new QueryClient();
    const initialRepeatTodo: TodoItem = {
      id: "todo-repeat",
      listId: "list-1",
      text: "Take vitamins",
      completed: false,
      createdAt: 1000,
      priority: "medium",
      reminderAt: nineAm,
      reminderSent: true,
      recurrence: "daily",
    };
    qc.setQueryData<TodoItem[]>(["todos", "list-1"], [initialRepeatTodo]);

    await handleReminderNotificationAction(
      {
        actionIdentifier: REMINDER_ACTION_SNOOZE,
        notification: {
          date: nineAm,
          request: {
            identifier: "reminder_todo-repeat",
            content: {
              title: "Health",
              body: "Take vitamins",
              data: { todoId: "todo-repeat", listId: "list-1", recurrence: "daily" },
            },
          },
        },
      },
      qc
    );

    expect(mocks.notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "reminder_todo-repeat",
        content: expect.objectContaining({
          data: expect.objectContaining({
            todoId: "todo-repeat",
            listId: "list-1",
            recurrence: "daily",
          }),
        }),
        trigger: expect.objectContaining({
          date: new Date(nineTenAm),
        }),
      })
    );
    expect(mocks.client.apiClient.put).not.toHaveBeenCalled();
    expect(mocks.storage.has(SYNX_PENDING_NOTIFICATION_OPS_KEY)).toBe(false);
    expect(qc.getQueryData<TodoItem[]>(["todos", "list-1"])?.[0]?.reminderAt).toBe(nineAm);

    // Completing the snoozed repeating task at 9:10 keeps tomorrow's schedule at 9:00 AM
    resetNotificationActionDedupForTests();
    nowSpy.mockReturnValue(nineTenAm);
    const serverNextTodo: TodoItem = {
      ...initialRepeatTodo,
      completed: false,
      reminderAt: nextDayNineAm,
      reminderSent: false,
    };
    mocks.client.apiClient.post.mockImplementationOnce(async () => {
      const optimisticTodos = qc.getQueryData<TodoItem[]>(["todos", "list-1"]);
      expect(optimisticTodos?.[0]?.reminderAt).toBe(nextDayNineAm);
      return {
        data: { success: true, todo: serverNextTodo, rescheduled: true },
      };
    });

    await handleReminderNotificationAction(
      {
        actionIdentifier: REMINDER_ACTION_COMPLETE,
        notification: {
          date: nineTenAm,
          request: {
            identifier: "reminder_todo-repeat",
            content: {
              title: "Health",
              body: "Take vitamins",
              data: { todoId: "todo-repeat", listId: "list-1", recurrence: "daily" },
            },
          },
        },
      },
      qc
    );

    expect(mocks.client.apiClient.post).toHaveBeenCalledWith("/api/v1/todos/todo-repeat/completed", {
      completed: true,
    });
    expect(qc.getQueryData<TodoItem[]>(["todos", "list-1"])?.[0]?.reminderAt).toBe(nextDayNineAm);

    // Headless snooze (without QueryClient) also respects recurrence in notification data
    resetNotificationActionDedupForTests();
    nowSpy.mockReturnValue(nineAm);
    mocks.client.apiClient.put.mockClear();
    await handleReminderNotificationAction({
      actionIdentifier: REMINDER_ACTION_SNOOZE,
      notification: {
        date: nineAm + 1,
        request: {
          identifier: "reminder_todo-repeat-headless",
          content: {
            title: "Health",
            body: "Daily stretch",
            data: { todoId: "todo-repeat-headless", listId: "list-1", recurrence: "daily" },
          },
        },
      },
    });
    expect(mocks.client.apiClient.put).not.toHaveBeenCalled();
  });

  it("registers the headless TaskManager task and starts listeners in App + background worker", async () => {
    const taskFn = mocks.definedTasks.get(REMINDER_NOTIFICATION_TASK);
    expect(taskFn).toBeTypeOf("function");

    const qc = new QueryClient();
    const stop = startNotificationResponseService(qc);
    expect(mocks.notifications.registerTaskAsync).toHaveBeenCalledWith(REMINDER_NOTIFICATION_TASK);
    expect(mocks.responseListeners).toHaveLength(1);
    stop();

    // Also verifies App and background task wiring stay connected
    expect(appSource).toContain("startNotificationResponseService");
    expect(bgTaskSource).toContain("drainAndReplayPendingNotificationOps");
    expect(serverSource).toContain("REMINDER_NOTIFICATION_CATEGORY");
  });
});
