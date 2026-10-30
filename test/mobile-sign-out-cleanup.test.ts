import { describe, it, expect, vi, beforeEach } from "vitest";
import authContextSource from "../mobile/src/context/AuthContext.tsx?raw";

// Exercises mobile/src/services/signOutCleanup.ts with the real query cache
// (storage.ts) and widget preferences, against an in-memory AsyncStorage.

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const asyncStorage = {
    default: {
      getItem: async (k: string) => storage.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: async (k: string) => {
        storage.delete(k);
      },
      multiRemove: async (keys: string[]) => {
        for (const k of keys) storage.delete(k);
      },
    },
  };
  return {
    storage,
    asyncStorage,
    client: { secureSessionStore: { clearSessionTokens: vi.fn(async () => {}) } },
    notifications: { releasePushTokenForSignOut: vi.fn(async () => {}) },
    widgetSync: { resetWidgetsLoggedOut: vi.fn(() => {}) },
  };
});
vi.mock("@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../mobile/src/api/client", () => mocks.client);
vi.mock("../mobile/src/services/notifications", () => mocks.notifications);
vi.mock("../mobile/src/services/widgetSync", () => mocks.widgetSync);

import {
  QUERY_CACHE_STORAGE_KEY,
  asyncStoragePersister,
  clearPersistedQueryCache,
  queryClient,
} from "../mobile/src/services/storage";
import {
  STORAGE_KEY_LAST_ACTIVE_LIST_ID,
  STORAGE_KEY_PINNED_WIDGET_CONFIG,
} from "../mobile/src/services/widgetPreferences";

// signOutCleanup imports widgetSync, which pulls in the widget components.
// Those only type-check under the mobile app's own config (Mobile typecheck),
// not this test config, so load the module through a non-literal specifier
// that tsc doesn't follow. Vitest still resolves it with the mocks above.
const SIGN_OUT_CLEANUP_MODULE = "../mobile/src/services/signOutCleanup";
type SignOutCleanupModule = { clearSignedOutDeviceData: () => Promise<void> };
function loadSignOutCleanup(): Promise<SignOutCleanupModule> {
  return import(/* @vite-ignore */ SIGN_OUT_CLEANUP_MODULE) as Promise<SignOutCleanupModule>;
}

// The persister's default key. Changing it would orphan existing caches.
const QUERY_CACHE_KEY = "REACT_QUERY_OFFLINE_CACHE";

describe("mobile sign-out cleanup", () => {
  beforeEach(() => {
    mocks.storage.clear();
    vi.clearAllMocks();
  });

  it("clears the query cache, widget preferences and widgets", async () => {
    queryClient.setQueryData(["todos", "list-1"], [{ id: "t1", text: "Private task" }]);
    mocks.storage.set(QUERY_CACHE_KEY, "{\"clientState\":{}}");
    mocks.storage.set(STORAGE_KEY_LAST_ACTIVE_LIST_ID, "list-1");
    mocks.storage.set(STORAGE_KEY_PINNED_WIDGET_CONFIG, "{\"listId\":\"list-1\"}");
    mocks.storage.set("unrelated_key", "kept");

    const { clearSignedOutDeviceData } = await loadSignOutCleanup();
    await clearSignedOutDeviceData();

    expect(queryClient.getQueryData(["todos", "list-1"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(mocks.storage.has(QUERY_CACHE_KEY)).toBe(false);
    expect(mocks.storage.has(STORAGE_KEY_LAST_ACTIVE_LIST_ID)).toBe(false);
    expect(mocks.storage.has(STORAGE_KEY_PINNED_WIDGET_CONFIG)).toBe(false);
    expect(mocks.storage.get("unrelated_key")).toBe("kept");
    expect(mocks.widgetSync.resetWidgetsLoggedOut).toHaveBeenCalledTimes(1);
    expect(mocks.client.secureSessionStore.clearSessionTokens).toHaveBeenCalledTimes(1);
    expect(mocks.notifications.releasePushTokenForSignOut).toHaveBeenCalledTimes(1);
  });

  it("logs and removes the cache key directly when the persister cleanup fails", async () => {
    expect(QUERY_CACHE_STORAGE_KEY).toBe(QUERY_CACHE_KEY);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const removeClient = vi
      .spyOn(asyncStoragePersister, "removeClient")
      .mockRejectedValueOnce(new Error("storage busy"));
    queryClient.setQueryData(["todos", "list-1"], [{ id: "t1" }]);
    mocks.storage.set(QUERY_CACHE_KEY, "{\"clientState\":{}}");

    await expect(clearPersistedQueryCache()).resolves.toBeUndefined();

    expect(removeClient).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["todos", "list-1"])).toBeUndefined();
    expect(mocks.storage.has(QUERY_CACHE_KEY)).toBe(false);
    removeClient.mockRestore();
    warn.mockRestore();
  });

  it("is used by both manual logout and clearLocalSessionState", () => {
    const body = (name: string) => {
      const start = authContextSource.indexOf(`const ${name} = useCallback(`);
      expect(start).toBeGreaterThan(-1);
      const end = authContextSource.indexOf("}, [", start);
      return authContextSource.slice(start, end);
    };
    expect(body("logout")).toContain("await clearSignedOutDeviceData();");
    expect(body("clearLocalSessionState")).toContain("await clearSignedOutDeviceData();");
  });
});
