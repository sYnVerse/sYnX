import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { TodoList } from "../shared";

const mocks = vi.hoisted(() => {
  const widgetSnapshots = new Map<string, Record<string, unknown>>();
  const asyncStorageMap = new Map<string, string>();

  const makePrimitive =
    (type: string) =>
    (props: Record<string, unknown> & { children?: ReactNode }) => ({
      type,
      props,
    });

  const Button = (props: Record<string, unknown>) => ({
    type: "Button",
    props,
  });

  const reactNative = {
    AppState: {
      currentState: "active",
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
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
    addUserInteractionListener: vi.fn(() => ({ remove: vi.fn() })),
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
    padding: vi.fn(() => ({})),
    paddingAll: vi.fn(() => ({})),
    fillMaxSize: vi.fn(() => ({})),
    fillMaxWidth: vi.fn(() => ({})),
    size: vi.fn(() => ({})),
    width: vi.fn(() => ({})),
    background: vi.fn(() => ({})),
    cornerRadius: vi.fn(() => ({})),
  };

  const apiClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  return {
    widgetSnapshots,
    asyncStorageMap,
    reactNative,
    expoWidgets,
    jetpackCompose,
    modifiers,
    apiClient,
    getLastActiveListId: vi.fn<() => Promise<string | null>>(async () => "list-archived"),
    getPinnedWidgetConfig: vi.fn<
      () => Promise<{ mode: "list" | "reminders"; listId: string } | null>
    >(async () => ({ mode: "list", listId: "list-pinned" })),
    setPinnedWidgetConfig: vi.fn(async () => undefined),
    getAccessToken: vi.fn<() => Promise<string | null>>(async () => "tok-mobile"),
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
  () => mocks.jetpackCompose,
);
vi.mock("@expo/ui/jetpack-compose/modifiers", () => mocks.modifiers);
vi.mock("../node_modules/@expo/ui/jetpack-compose/modifiers", () => mocks.modifiers);
vi.mock(
  "../node_modules/@expo/ui/build/jetpack-compose/modifiers/index.js",
  () => mocks.modifiers,
);
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.asyncStorageMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      mocks.asyncStorageMap.set(key, val);
    }),
  },
}));
vi.mock("../mobile/src/api/client", () => ({
  apiClient: mocks.apiClient,
  secureSessionStore: { getAccessToken: mocks.getAccessToken },
}));
vi.mock("../mobile/src/services/calendar", () => ({
  reconcileTasksWithNativeCalendar: vi.fn(async () => 0),
}));
vi.mock("../mobile/src/services/listNames", () => ({
  getCachedListName: vi.fn(() => "List"),
}));
vi.mock("../mobile/src/services/taskSortPreferences", () => ({
  getTaskSortPreferences: vi.fn(() => ({ appDefault: "created", overrides: {} })),
  loadTaskSortPreferences: vi.fn(async () => undefined),
  subscribeTaskSortPreferences: vi.fn(() => () => undefined),
}));
vi.mock("../mobile/src/services/widgetPreferences", () => ({
  getLastActiveListId: mocks.getLastActiveListId,
  getPinnedWidgetConfig: mocks.getPinnedWidgetConfig,
  setPinnedWidgetConfig: mocks.setPinnedWidgetConfig,
}));

import { syncActiveList, syncPinnedList } from "../mobile/src/services/widgetSync";
import {
  clearDismissedArchivePromptForList,
  dismissArchivePromptForList,
  getArchiveSuggestionsEnabled,
  getDismissedArchivePrompts,
  resetArchivePreferencesForTest,
  updateArchiveSuggestionsPreference,
} from "../mobile/src/services/archivePreferences";

describe("Issue #230 mobile widgetSync & archivePreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.widgetSnapshots.clear();
    mocks.asyncStorageMap.clear();
    resetArchivePreferencesForTest();
  });

  it("clears pinned widget config and resets PinnedListWidget when pinned list is archived", async () => {
    const archivedPinnedList: TodoList = {
      id: "list-pinned",
      name: "Old Sprint",
      ownerId: "u1",
      shareMode: "private",
      createdAt: 1000,
      isArchived: true,
      archivedAt: 2000,
    };

    await syncPinnedList("list-pinned", archivedPinnedList, []);

    expect(mocks.setPinnedWidgetConfig).toHaveBeenCalledWith(null);
    const snap = mocks.widgetSnapshots.get("PinnedListWidget");
    expect(snap?.isLoggedIn).toBe(false);
    expect(snap?.listId).toBe("");
    expect(snap?.listTitle).toBe("sYnX");
  });

  it("falls back to first non-archived list when syncActiveList receives an archived list", async () => {
    const archivedList: TodoList = {
      id: "list-archived",
      name: "Archived",
      ownerId: "u1",
      shareMode: "private",
      createdAt: 1000,
      isArchived: true,
      archivedAt: 2000,
    };
    const fallbackActiveList: TodoList = {
      id: "list-active",
      name: "Active Work",
      ownerId: "u1",
      shareMode: "private",
      createdAt: 1500,
      isArchived: false,
      archivedAt: null,
    };
    const queryClient = {
      getQueryData: vi.fn((key: unknown[]) => {
        if (key[0] === "lists") return [archivedList, fallbackActiveList];
        if (key[0] === "todos" && key[1] === "list-active") {
          return [{ id: "t1", listId: "list-active", text: "Keep going", completed: false, createdAt: 1 }];
        }
        return undefined;
      }),
      setQueryData: vi.fn(),
    };

    await syncActiveList("list-archived", archivedList, [], queryClient as any);

    const currentSnap = mocks.widgetSnapshots.get("CurrentListWidget");
    expect(currentSnap?.listId).toBe("list-active");
    expect(currentSnap?.listTitle).toBe("Active Work");
    const progressSnap = mocks.widgetSnapshots.get("ListProgressWidget");
    expect(progressSnap?.listId).toBe("list-active");
    expect(progressSnap?.listTitle).toBe("Active Work");
  });

  it("resets CurrentListWidget and ListProgressWidget when all lists are archived", async () => {
    const archivedOnly: TodoList = {
      id: "list-archived",
      name: "Archived",
      ownerId: "u1",
      shareMode: "private",
      createdAt: 1000,
      isArchived: true,
      archivedAt: 2000,
    };
    mocks.apiClient.get.mockResolvedValue({ data: { lists: [] } });

    await syncActiveList("list-archived", archivedOnly, []);

    expect(mocks.widgetSnapshots.get("CurrentListWidget")?.isLoggedIn).toBe(false);
    expect(mocks.widgetSnapshots.get("CurrentListWidget")?.listId).toBe("");
    expect(mocks.widgetSnapshots.get("ListProgressWidget")?.isLoggedIn).toBe(false);
    expect(mocks.widgetSnapshots.get("ListProgressWidget")?.listTitle).toBe("sYnX");
  });

  it("persists dismissed prompt cycles and rolls back archiveSuggestionsEnabled when PUT fails", async () => {
    mocks.apiClient.put.mockRejectedValueOnce(new Error("offline"));
    await expect(updateArchiveSuggestionsPreference(false)).rejects.toThrow("offline");
    expect(getArchiveSuggestionsEnabled()).toBe(true);

    mocks.apiClient.put.mockResolvedValueOnce({ data: { success: true } });
    await updateArchiveSuggestionsPreference(false);
    expect(getArchiveSuggestionsEnabled()).toBe(false);

    await dismissArchivePromptForList("l-done");
    expect(getDismissedArchivePrompts().has("l-done")).toBe(true);
    await clearDismissedArchivePromptForList("l-done");
    expect(getDismissedArchivePrompts().has("l-done")).toBe(false);
  });
});
