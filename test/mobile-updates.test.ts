import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const appStateListeners: ((s: string) => void)[] = [];
  const updatesStateListeners: ((e: any) => void)[] = [];

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
      latestContext: null as any,
      checkForUpdateAsync: vi.fn(async () => ({ isAvailable: false, isRollBackToEmbedded: false })),
      fetchUpdateAsync: vi.fn(async () => ({ isNew: false, isRollBackToEmbedded: false })),
      reloadAsync: vi.fn(async () => {}),
      useUpdates: vi.fn(() => ({
        isUpdatePending: false,
        isUpdateAvailable: false,
        isChecking: false,
        isDownloading: false,
      })),
      addUpdatesStateChangeListener: vi.fn((cb: (e: any) => void) => {
        updatesStateListeners.push(cb);
        return {
          remove: vi.fn(() => {
            const idx = updatesStateListeners.indexOf(cb);
            if (idx >= 0) updatesStateListeners.splice(idx, 1);
          }),
        };
      }),
    },
    constants: {
      nativeAppVersion: "3.6.0",
      nativeBuildVersion: "42",
      expoConfig: { version: "3.6.0" },
    },
    appStateListeners,
    updatesStateListeners,
  };
});

vi.mock("react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNative);
vi.mock("expo-updates", () => mocks.updates);
vi.mock("../mobile/node_modules/expo-updates", () => mocks.updates);
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("../mobile/node_modules/expo-constants", () => ({ default: mocks.constants }));

import ignoreContent from "../mobile/.fingerprintignore?raw";
import {
  formatShortId,
  getUpdateState,
  subscribeUpdateState,
  checkForUpdate,
  reloadToApplyUpdate,
  resetUpdateStateForTesting,
  syncNativeUpdateContext,
  bridgeNativeUpdatesState,
} from "../mobile/src/services/updates";

describe("mobile updates service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.isEnabled = false;
    mocks.updates.isEmergencyLaunch = false;
    mocks.updates.isEmbeddedLaunch = true;
    mocks.updates.latestContext = null;
    mocks.updates.useUpdates.mockReturnValue({
      isUpdatePending: false,
      isUpdateAvailable: false,
      isChecking: false,
      isDownloading: false,
    });
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
      expect(state).toHaveProperty("isRollBackToEmbedded", false);
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
        isRollBackToEmbedded: false,
      });
      mocks.updates.fetchUpdateAsync.mockResolvedValueOnce({
        isNew: true,
        isRollBackToEmbedded: false,
      });

      const res = await checkForUpdate({ manual: true });
      expect(res.hasUpdate).toBe(true);
      expect(res.isRollBack).toBe(false);
      expect(mocks.updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
      expect(mocks.updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.isRollBackToEmbedded).toBe(false);
      expect(state.lastCheckedAt).not.toBeNull();
    });

    it("handles rollback directives with isAvailable: false and isRollBackToEmbedded: true", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.checkForUpdateAsync.mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: true,
      });
      mocks.updates.fetchUpdateAsync.mockResolvedValueOnce({
        isNew: false,
        isRollBackToEmbedded: true,
      });

      const res = await checkForUpdate({ manual: true });
      expect(res.hasUpdate).toBe(true);
      expect(res.isRollBack).toBe(true);
      expect(mocks.updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
      expect(mocks.updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.isRollBackToEmbedded).toBe(true);
    });

    it("throttles automatic checks within cooldown period", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.checkForUpdateAsync.mockResolvedValue({
        isAvailable: false,
        isRollBackToEmbedded: false,
      });

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

  describe("native state machine bridging", () => {
    it("bridges startup-downloaded updates from native latestContext", () => {
      mocks.updates.latestContext = {
        isUpdatePending: true,
        downloadedManifest: { id: "test-startup-update-id" },
      };
      syncNativeUpdateContext();

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
    });

    it("bridges native state change events emitted during background or startup downloads", () => {
      mocks.updates.latestContext = null;
      resetUpdateStateForTesting();

      expect(getUpdateState().isUpdatePending).toBe(false);

      expect(mocks.updatesStateListeners.length).toBeGreaterThan(0);
      mocks.updatesStateListeners.forEach((listener) => {
        listener({
          context: {
            isUpdatePending: true,
            isUpdateAvailable: true,
            downloadedManifest: { id: "bg-downloaded-id" },
          },
        });
      });

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.isUpdateAvailable).toBe(true);
    });

    it("bridges native rollback directives into state singleton", () => {
      resetUpdateStateForTesting();

      mocks.updatesStateListeners.forEach((listener) => {
        listener({
          context: {
            isUpdatePending: true,
            rollback: { commitTime: "2026-11-07T00:00:00.000Z" },
          },
        });
      });

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.isRollBackToEmbedded).toBe(true);
    });

    it("bridges native useUpdates hook state into singleton store", () => {
      bridgeNativeUpdatesState({
        isUpdatePending: true,
        isUpdateAvailable: true,
        isChecking: false,
        isDownloading: false,
        downloadedUpdate: { manifest: { id: "hook-downloaded-id" }, type: "new" },
      });

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.isUpdateAvailable).toBe(true);
    });
  });

  describe("fingerprintignore rules", () => {
    it("does not ignore native configuration assets in mobile/.fingerprintignore", () => {
      expect(ignoreContent).not.toMatch(/^assets\/\*\*/m);
      expect(ignoreContent).toContain("src/**");
    });
  });

  describe("reloadToApplyUpdate", () => {
    it("does not reload if updates are disabled or no update is pending", async () => {
      mocks.updates.isEnabled = false;
      const ok = await reloadToApplyUpdate();
      expect(ok).toBe(false);
      expect(mocks.updates.reloadAsync).not.toHaveBeenCalled();
    });

    it("triggers reloadAsync when an update is pending", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.latestContext = { isUpdatePending: true };
      syncNativeUpdateContext();

      const ok = await reloadToApplyUpdate();
      expect(ok).toBe(true);
      expect(mocks.updates.reloadAsync).toHaveBeenCalledTimes(1);
    });
  });
});
