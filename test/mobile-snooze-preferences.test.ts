import { describe, it, expect, vi, beforeEach } from "vitest";
import settingsSource from "../mobile/src/screens/SettingsScreen.tsx?raw";
import authContextSource from "../mobile/src/context/AuthContext.tsx?raw";
import notificationsSource from "../mobile/src/services/notifications.ts?raw";

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
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
  const apiClient = {
    get: vi.fn(),
    put: vi.fn(),
  };
  return { storage, asyncStorage, apiClient };
});

vi.mock("@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../node_modules/@react-native-async-storage/async-storage", () => mocks.asyncStorage);
vi.mock("../mobile/src/api/client", () => ({ apiClient: mocks.apiClient }));

import {
  STORAGE_KEY_SNOOZE_MINUTES,
  clearSnoozePreferences,
  getCachedSnoozeMinutes,
  loadSnoozePreferences,
  readSnoozeMinutesForNotification,
  resetSnoozePreferencesForTest,
  setSnoozeMinutesLocal,
  subscribeSnoozePreferences,
  syncSnoozeMinutesFromServer,
  updateSnoozeMinutesPreference,
} from "../mobile/src/services/snoozePreferences";

describe("mobile snoozePreferences service & wiring (#211)", () => {
  beforeEach(() => {
    mocks.storage.clear();
    resetSnoozePreferencesForTest();
    vi.clearAllMocks();
  });

  it("loads stored duration or falls back to 10 minutes for missing/corrupt values", async () => {
    expect(await loadSnoozePreferences()).toBe(10);

    resetSnoozePreferencesForTest();
    mocks.storage.set(STORAGE_KEY_SNOOZE_MINUTES, "45");
    expect(await loadSnoozePreferences()).toBe(45);
    expect(getCachedSnoozeMinutes()).toBe(45);

    resetSnoozePreferencesForTest();
    mocks.storage.set(STORAGE_KEY_SNOOZE_MINUTES, "1441");
    expect(await loadSnoozePreferences()).toBe(10);

    resetSnoozePreferencesForTest();
    mocks.storage.set(STORAGE_KEY_SNOOZE_MINUTES, "not-a-number");
    expect(await loadSnoozePreferences()).toBe(10);
  });

  it("readSnoozeMinutesForNotification reads directly from AsyncStorage for headless execution", async () => {
    mocks.storage.set(STORAGE_KEY_SNOOZE_MINUTES, "30");
    expect(await readSnoozeMinutesForNotification()).toBe(30);

    // Even if another execution context updates AsyncStorage directly, notification reader sees it
    mocks.storage.set(STORAGE_KEY_SNOOZE_MINUTES, "60");
    expect(await readSnoozeMinutesForNotification()).toBe(60);

    mocks.storage.set(STORAGE_KEY_SNOOZE_MINUTES, "0");
    expect(await readSnoozeMinutesForNotification()).toBe(10);
  });

  it("syncSnoozeMinutesFromServer and updateSnoozeMinutesPreference persist optimistically and roll back on error", async () => {
    const listener = vi.fn();
    const unsub = subscribeSnoozePreferences(listener);

    mocks.apiClient.get.mockResolvedValueOnce({ data: { settings: { snoozeMinutes: 15 } } });
    expect(await syncSnoozeMinutesFromServer()).toBe(15);
    expect(mocks.storage.get(STORAGE_KEY_SNOOZE_MINUTES)).toBe("15");

    // Client-side validation rejects invalid minutes without hitting server
    await expect(updateSnoozeMinutesPreference(0)).rejects.toThrow(/between 1 and 1,440/);
    await expect(updateSnoozeMinutesPreference(1441)).rejects.toThrow(/between 1 and 1,440/);
    await expect(updateSnoozeMinutesPreference(12.5)).rejects.toThrow(/between 1 and 1,440/);
    expect(mocks.apiClient.put).not.toHaveBeenCalled();

    // API failure rolls back cache and AsyncStorage
    mocks.apiClient.put.mockRejectedValueOnce(new Error("Network error"));
    await expect(updateSnoozeMinutesPreference(30)).rejects.toThrow("Network error");
    expect(getCachedSnoozeMinutes()).toBe(15);
    expect(mocks.storage.get(STORAGE_KEY_SNOOZE_MINUTES)).toBe("15");

    // Successful update writes server value locally
    mocks.apiClient.put.mockResolvedValueOnce({ data: { settings: { snoozeMinutes: 120 } } });
    expect(await updateSnoozeMinutesPreference(120)).toBe(120);
    expect(getCachedSnoozeMinutes()).toBe(120);
    expect(mocks.storage.get(STORAGE_KEY_SNOOZE_MINUTES)).toBe("120");
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it("setSnoozeMinutesLocal(null) resets to 10 and clearSnoozePreferences cleans storage without API calls", async () => {
    await setSnoozeMinutesLocal(60);
    expect(mocks.storage.get(STORAGE_KEY_SNOOZE_MINUTES)).toBe("60");

    await setSnoozeMinutesLocal(null);
    expect(mocks.storage.get(STORAGE_KEY_SNOOZE_MINUTES)).toBe("10");

    await clearSnoozePreferences();
    expect(mocks.storage.has(STORAGE_KEY_SNOOZE_MINUTES)).toBe(false);
    expect(getCachedSnoozeMinutes()).toBe(10);
    expect(mocks.apiClient.put).not.toHaveBeenCalled();
  });

  it("wires SettingsScreen preset/custom controls, AuthContext sync, and notification handler", () => {
    expect(settingsSource).toContain("useSnoozePreferences");
    expect(settingsSource).toContain("settings-snooze-preset-");
    expect(settingsSource).toContain("settings-snooze-custom-input");
    expect(settingsSource).toContain("settings-snooze-custom-apply");
    expect(settingsSource).toContain("settings-snooze-error");
    expect(authContextSource).toContain("setSnoozeMinutesLocal");
    expect(notificationsSource).toContain("readSnoozeMinutesForNotification");
  });
});
