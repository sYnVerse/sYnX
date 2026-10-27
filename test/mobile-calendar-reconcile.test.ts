import { describe, it, expect, vi, beforeEach } from "vitest";
import widgetSyncSource from "../mobile/src/services/widgetSync.ts?raw";
import appSource from "../mobile/App.tsx?raw";

// Exercises mobile/src/services/calendarReconcile.ts: how the app finds task changes made
// outside it (home screen widget, web app, other devices) and hands them to the calendar.

const mocks = vi.hoisted(() => {
  const appStateListeners: ((s: string) => void)[] = [];
  const reactNative = {
    Platform: { OS: "android" },
    AppState: {
      addEventListener: vi.fn((_: string, cb: (s: string) => void) => {
        appStateListeners.push(cb);
        return { remove: vi.fn() };
      }),
    },
  };
  const calendar = {
    reconcileTasksWithNativeCalendar: vi.fn(async () => 0),
    getListIdsWithSyncedEvents: vi.fn(async () => ["L1", "L2"]),
    isCalendarSyncEnabled: vi.fn(async () => true),
  };
  const client = {
    apiClient: { get: vi.fn(async (url: string) => ({ data: { todos: [{ id: url }] } })) },
    secureSessionStore: { getAccessToken: vi.fn(async () => "token") },
  };
  return { reactNative, calendar, client, appStateListeners };
});
vi.mock("react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNative);
vi.mock("../mobile/src/services/calendar", () => mocks.calendar);
vi.mock("../mobile/src/api/client", () => mocks.client);

import {
  collectCachedTasks,
  reconcileCalendarFromCache,
  refreshListsWithSyncedEvents,
} from "../mobile/src/services/calendarReconcile";

function fakeQueryClient(data: Record<string, [unknown[], unknown][]>) {
  return {
    getQueriesData: vi.fn(({ queryKey }: { queryKey: string[] }) => data[queryKey[0]] ?? []),
    getQueryData: vi.fn(() => undefined),
    fetchQuery: vi.fn(async (opts: any) => opts.queryFn()),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("calendar reconcile service", () => {
  it("collects every cached task, preferring the full list over the preview", () => {
    const qc = fakeQueryClient({
      todos: [[["todos", "L1"], [{ id: "a", completed: true }]]],
      active_list_todos_preview: [[["active_list_todos_preview", "L1"], [{ id: "a", completed: false }, { id: "b" }]]],
    });
    const tasks = collectCachedTasks(qc);
    expect(tasks).toEqual([{ id: "a", completed: true }, { id: "b" }]);
  });

  it("reconciles the cached tasks with the device calendar", async () => {
    const qc = fakeQueryClient({ todos: [[["todos", "L1"], [{ id: "a", listId: "L1", completed: true }]]] });
    await reconcileCalendarFromCache(qc);
    expect(mocks.calendar.reconcileTasksWithNativeCalendar).toHaveBeenCalledWith(
      [{ id: "a", listId: "L1", completed: true }],
      expect.any(Function)
    );
  });

  it("refreshes each list that has synced events so outside check-offs are picked up", async () => {
    const qc = fakeQueryClient({});
    await refreshListsWithSyncedEvents(qc);
    expect(qc.fetchQuery).toHaveBeenCalledTimes(2);
    expect(qc.fetchQuery.mock.calls.map((c: any) => c[0].queryKey)).toEqual([
      ["todos", "L1"],
      ["todos", "L2"],
    ]);
    expect(mocks.client.apiClient.get).toHaveBeenCalledWith("/api/v1/todos?listId=L1");
  });

  it("skips the refresh when calendar sync is off or the user is signed out", async () => {
    const qc = fakeQueryClient({});
    mocks.calendar.isCalendarSyncEnabled.mockResolvedValueOnce(false);
    await refreshListsWithSyncedEvents(qc);
    mocks.client.secureSessionStore.getAccessToken.mockResolvedValueOnce(null as any);
    await refreshListsWithSyncedEvents(qc);
    expect(qc.fetchQuery).not.toHaveBeenCalled();
  });

  it("widget check-off replays are applied to the calendar", () => {
    expect(widgetSyncSource).toContain("reconcileTasksWithNativeCalendar(");
    expect(appSource).toContain("startCalendarReconcileService(queryClient)");
  });
});
