import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const appStateListeners: ((s: string) => void)[] = [];
  return {
    reactNative: {
      Platform: { OS: "android" },
      AppState: {
        addEventListener: vi.fn((_: string, cb: (s: string) => void) => {
          appStateListeners.push(cb);
          return { remove: vi.fn() };
        }),
      },
    },
    updates: {
      isEnabled: false,
      isEmergencyLaunch: false,
      isEmbeddedLaunch: true,
      runtimeVersion: "fingerprint-123456789",
      updateId: "98765432-abcd-ef01-2345-6789abcdef01",
      channel: "preview",
      checkForUpdateAsync: vi.fn(async () => ({ isAvailable: false })),
      fetchUpdateAsync: vi.fn(async () => ({ isNew: false })),
      reloadAsync: vi.fn(async () => {}),
    },
    constants: {
      nativeAppVersion: "3.6.0",
      nativeBuildVersion: "42",
      expoConfig: { version: "3.6.0" },
    },
    appStateListeners,
  };
});

vi.mock("react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNative);
vi.mock("expo-updates", () => mocks.updates);
vi.mock("../mobile/node_modules/expo-updates", () => mocks.updates);
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("../mobile/node_modules/expo-constants", () => ({ default: mocks.constants }));

import {
  formatShortId,
  getUpdateState,
  subscribeUpdateState,
  checkForUpdate,
  reloadToApplyUpdate,
  resetUpdateStateForTesting,
} from "../mobile/src/services/updates";

describe("mobile updates service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.isEnabled = false;
    mocks.updates.isEmergencyLaunch = false;
    mocks.updates.isEmbeddedLaunch = true;
    resetUpdateStateForTesting();
  });

  describe("formatShortId", () => {
    it("returns the fallback when id is null or undefined", () => {
      expect(formatShortId(null)).toBe("None");
      expect(formatShortId(undefined, "embedded")).toBe("embedded");
      expect(formatShortId("", "fallback")).toBe("fallback");
    });

    it("returns short identifiers as-is", () => {
      expect(formatShortId("v1.0")).toBe("v1.0");
      expect(formatShortId("12345678")).toBe("12345678");
    });

    it("truncates long hashes/UUIDs to 8 characters", () => {
      expect(formatShortId("98765432-abcd-ef01-2345")).toBe("98765432");
      expect(formatShortId("fingerprint-abcdef123456")).toBe("fingerpr");
    });
  });

  describe("getUpdateState & subscribeUpdateState", () => {
    it("returns the current state with native metadata", () => {
      const state = getUpdateState();
      expect(state).toHaveProperty("isEnabled");
      expect(state).toHaveProperty("isChecking");
      expect(state).toHaveProperty("isDownloading");
      expect(state).toHaveProperty("isUpdateAvailable");
      expect(state).toHaveProperty("isUpdatePending");
      expect(state).toHaveProperty("nativeAppVersion", "3.6.0");
      expect(state).toHaveProperty("nativeBuildVersion", "42");
    });

    it("notifies subscribers immediately and cleans up on unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeUpdateState(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isChecking: false }));

      unsubscribe();
    });
  });

  describe("checkForUpdate", () => {
    it("returns false with error message when updates are disabled", async () => {
      mocks.updates.isEnabled = false;
      const res = await checkForUpdate({ manual: true });
      expect(res.hasUpdate).toBe(false);
      expect(res.error).toMatch(/disabled/i);
      expect(mocks.updates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it("checks and downloads update when enabled and available", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.checkForUpdateAsync.mockResolvedValueOnce({
        isAvailable: true,
      });
      mocks.updates.fetchUpdateAsync.mockResolvedValueOnce({
        isNew: true,
      });

      const res = await checkForUpdate({ manual: true });
      expect(res.hasUpdate).toBe(true);
      expect(mocks.updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
      expect(mocks.updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.lastCheckedAt).not.toBeNull();
    });

    it("throttles automatic checks within cooldown period", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

      // First check succeeds
      const first = await checkForUpdate({ manual: false });
      expect(first.hasUpdate).toBe(false);
      expect(mocks.updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);

      // Immediate second automatic check is throttled
      const second = await checkForUpdate({ manual: false });
      expect(second.hasUpdate).toBe(false);
      expect(mocks.updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);

      // Manual check bypasses cooldown
      const manual = await checkForUpdate({ manual: true });
      expect(manual.hasUpdate).toBe(false);
      expect(mocks.updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe("reloadToApplyUpdate", () => {
    it("does not reload if updates are disabled or no update is pending", async () => {
      mocks.updates.isEnabled = false;
      const ok = await reloadToApplyUpdate();
      expect(ok).toBe(false);
      expect(mocks.updates.reloadAsync).not.toHaveBeenCalled();
    });
  });
});
