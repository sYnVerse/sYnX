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
    application: {
      nativeApplicationVersion: "3.8.0" as string | null,
      nativeBuildVersion: "42" as string | null,
    },
    constants: {
      nativeAppVersion: "3.8.0",
      nativeBuildVersion: "42",
      expoConfig: { version: "3.8.0", android: { versionCode: 42 } },
    },
    apiClient: {
      get: vi.fn<(...args: any[]) => any>(async () => ({ data: { updateRequired: false } })),
    },
    asyncStorage: {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {}),
      removeItem: vi.fn(async () => {}),
    },
    appStateListeners,
    updatesStateListeners,
  };
});

vi.mock("react-native", () => mocks.reactNative);
vi.mock("../mobile/node_modules/react-native", () => mocks.reactNative);
vi.mock("expo-application", () => mocks.application);
vi.mock("../mobile/node_modules/expo-application", () => mocks.application);
vi.mock("expo-updates", () => mocks.updates);
vi.mock("../mobile/node_modules/expo-updates", () => mocks.updates);
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("../mobile/node_modules/expo-constants", () => ({ default: mocks.constants }));
vi.mock("../mobile/src/api/client", () => ({
  apiClient: mocks.apiClient,
  onNativeUpdateRequired: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mocks.asyncStorage,
}));
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => ({
  default: mocks.asyncStorage,
}));

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
  checkNativeAppUpdate,
  dismissNativeUpdatePrompt,
  markNativeUpdateRequired,
} from "../mobile/src/services/updates";

describe("mobile updates service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.isEnabled = false;
    mocks.updates.isEmergencyLaunch = false;
    mocks.updates.isEmbeddedLaunch = true;
    mocks.updates.latestContext = null;
    mocks.application.nativeApplicationVersion = "3.8.0";
    mocks.application.nativeBuildVersion = "42";
    mocks.constants.nativeAppVersion = "3.8.0";
    mocks.constants.nativeBuildVersion = "42";
    mocks.updates.runtimeVersion = "9b83facafc79485ba4e7649aadf56dd10c617724";
    mocks.apiClient.get.mockRejectedValue(new Error("Offline default in tests"));
    mocks.asyncStorage.getItem.mockResolvedValue(null);
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
      expect(state).toHaveProperty("nativeAppVersion", "3.8.0");
      expect(state).toHaveProperty("nativeBuildVersion", "42");
    });

    it("falls back to expoConfig version when Application version is unavailable", () => {
      mocks.application.nativeApplicationVersion = null;
      mocks.application.nativeBuildVersion = null;
      mocks.constants.nativeAppVersion = undefined as any;
      mocks.constants.nativeBuildVersion = undefined as any;
      mocks.constants.expoConfig = { version: "3.8.0", android: { versionCode: 42 } };

      resetUpdateStateForTesting();
      const state = getUpdateState();
      expect(state.nativeAppVersion).toBe("3.8.0");
      expect(state.nativeBuildVersion).toBe("42");

      // Restore defaults for subsequent tests
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.application.nativeBuildVersion = "42";
      resetUpdateStateForTesting();
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

    it("keeps restart disabled while fetch is in progress", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.checkForUpdateAsync.mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: true,
      });

      let finishFetch: (val: any) => void = () => {};
      const fetchPromise = new Promise<{ isNew: boolean; isRollBackToEmbedded: boolean }>((resolve) => {
        finishFetch = resolve;
      });
      mocks.updates.fetchUpdateAsync.mockReturnValueOnce(fetchPromise);

      const checkPromise = checkForUpdate({ manual: true });
      // Flush microtasks so checkForUpdateAsync resolves and fetchUpdateAsync is triggered
      await Promise.resolve();
      await Promise.resolve();

      // State while fetch is in-flight:
      // Downloading is true, but restart readiness is NOT enabled
      expect(getUpdateState().isDownloading).toBe(true);
      expect(getUpdateState().isUpdatePending).toBe(false);
      expect(getUpdateState().isRollBackToEmbedded).toBe(false);
      expect(await reloadToApplyUpdate()).toBe(false);

      finishFetch({ isNew: false, isRollBackToEmbedded: true });
      await checkPromise;

      expect(getUpdateState().isUpdatePending).toBe(true);
      expect(getUpdateState().isRollBackToEmbedded).toBe(true);
    });

    it("does not enable restart when rollback fetch fails", async () => {
      mocks.updates.isEnabled = true;
      mocks.updates.checkForUpdateAsync.mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: true,
      });
      mocks.updates.fetchUpdateAsync.mockRejectedValueOnce(new Error("Network timeout during fetch"));

      const res = await checkForUpdate({ manual: true });
      expect(res.hasUpdate).toBe(false);
      expect(res.error).toMatch(/timeout/i);

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(false);
      expect(state.isRollBackToEmbedded).toBe(false);
      expect(await reloadToApplyUpdate()).toBe(false);
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
      expect(state.isRollBackToEmbedded).toBe(false);
    });

    it("does not enable restart for check-only rollback without isUpdatePending: true", () => {
      mocks.updates.latestContext = {
        isUpdatePending: false,
        isUpdateAvailable: true,
        rollback: { commitTime: "2026-11-07T00:00:00.000Z" },
      };
      syncNativeUpdateContext();

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(false);
      expect(state.isRollBackToEmbedded).toBe(false);
      expect(state.isUpdateAvailable).toBe(true);
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
      expect(state.isRollBackToEmbedded).toBe(false);
    });

    it("bridges native rollback directives into state singleton when isUpdatePending is true", () => {
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

    it("reconciles false transitions and clears pending/rollback state", () => {
      // Step 1: Set pending rollback
      syncNativeUpdateContext({
        isUpdatePending: true,
        rollback: { commitTime: "2026-11-07T00:00:00.000Z" },
      });
      expect(getUpdateState().isUpdatePending).toBe(true);
      expect(getUpdateState().isRollBackToEmbedded).toBe(true);

      // Step 2: Native state transitions to cleared/false
      syncNativeUpdateContext({
        isUpdatePending: false,
        isUpdateAvailable: false,
      });

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(false);
      expect(state.isRollBackToEmbedded).toBe(false);
      expect(state.isUpdateAvailable).toBe(false);
    });

    it("clears rollback identity when a normal downloaded update replaces it", () => {
      // Step 1: Set pending rollback
      syncNativeUpdateContext({
        isUpdatePending: true,
        rollback: { commitTime: "2026-11-07T00:00:00.000Z" },
      });
      expect(getUpdateState().isRollBackToEmbedded).toBe(true);

      // Step 2: A normal update download completes with downloadedManifest
      syncNativeUpdateContext({
        isUpdatePending: true,
        isUpdateAvailable: true,
        downloadedManifest: { id: "new-normal-update-id" },
      });

      const state = getUpdateState();
      expect(state.isUpdatePending).toBe(true);
      expect(state.isRollBackToEmbedded).toBe(false);
    });

    it("bridges hook state bidirectional reconciliation for normal and rollback updates", () => {
      // Check-only rollback via hook does not enable restart
      bridgeNativeUpdatesState({
        isUpdatePending: false,
        isUpdateAvailable: true,
        availableUpdate: { type: "rollback" },
      });
      expect(getUpdateState().isUpdatePending).toBe(false);
      expect(getUpdateState().isRollBackToEmbedded).toBe(false);

      // Downloaded rollback enables rollback restart
      bridgeNativeUpdatesState({
        isUpdatePending: true,
        isUpdateAvailable: true,
        downloadedUpdate: { type: "rollback" },
      });
      expect(getUpdateState().isUpdatePending).toBe(true);
      expect(getUpdateState().isRollBackToEmbedded).toBe(true);

      // Subsequent normal update download replaces rollback label
      bridgeNativeUpdatesState({
        isUpdatePending: true,
        isUpdateAvailable: true,
        downloadedUpdate: { type: "new", manifest: { id: "hook-id" } },
      });
      expect(getUpdateState().isUpdatePending).toBe(true);
      expect(getUpdateState().isRollBackToEmbedded).toBe(false);

      // Cleared state clears all flags
      bridgeNativeUpdatesState({
        isUpdatePending: false,
        isUpdateAvailable: false,
      });
      expect(getUpdateState().isUpdatePending).toBe(false);
      expect(getUpdateState().isRollBackToEmbedded).toBe(false);
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

  describe("native app updates (issue #202)", () => {
    it("initializes with default nativeUpdate state", () => {
      const state = getUpdateState();
      expect(state.nativeUpdate).toBeDefined();
      expect(state.nativeUpdate.isUpdateRequired).toBe(false);
      expect(state.nativeUpdate.isDismissed).toBe(false);
    });

    it("evaluates native update required when runtime version does not match active OTA runtime", async () => {
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.constants.nativeAppVersion = "3.8.0";
      mocks.updates.runtimeVersion = "outdated-fingerprint-old";
      resetUpdateStateForTesting();

      const res = await checkNativeAppUpdate();
      expect(res.isUpdateRequired).toBe(true);
      expect(res.reason).toBe("runtime_mismatch");
      expect(res.message).toMatch(/Over-The-Air updates are no longer supported/i);
      expect(getUpdateState().nativeUpdate.isUpdateRequired).toBe(true);
    });

    it("evaluates native update required when native build version is below minimum", async () => {
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.constants.nativeAppVersion = "3.8.0";
      mocks.application.nativeBuildVersion = "10";
      mocks.constants.nativeBuildVersion = "10";
      resetUpdateStateForTesting();

      const res = await checkNativeAppUpdate();
      expect(res.isUpdateRequired).toBe(true);
      expect(res.reason).toBe("build_below_minimum");
    });

    it("evaluates native update required when native app version is below minimum", async () => {
      mocks.application.nativeApplicationVersion = "3.5.0";
      mocks.constants.nativeAppVersion = "3.5.0";
      resetUpdateStateForTesting();

      const res = await checkNativeAppUpdate();
      expect(res.isUpdateRequired).toBe(true);
      expect(res.reason).toBe("version_below_minimum");
    });

    it("incorporates server response when /api/v1/mobile/version returns update requirement", async () => {
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.constants.nativeAppVersion = "3.8.0";
      mocks.apiClient.get.mockResolvedValueOnce({
        data: {
          updateRequired: true,
          isBlocking: true,
          reason: "runtime_mismatch",
          message: "Remote server demands update",
          downloadUrl: "https://custom.download/url",
          latest: {
            latestVersion: "3.9.0",
            latestBuildVersion: 35,
            latestRuntimeVersion: "remote-hash",
          },
        },
      });

      const res = await checkNativeAppUpdate();
      expect(res.isUpdateRequired).toBe(true);
      expect(res.isBlocking).toBe(true);
      expect(res.downloadUrl).toBe("https://custom.download/url");
      expect(res.message).toBe("Remote server demands update");
      expect(res.latestVersion).toBe("3.9.0");
    });

    it("falls back to local evaluation when remote /api/v1/mobile/version fails (offline)", async () => {
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.constants.nativeAppVersion = "3.8.0";
      mocks.updates.runtimeVersion = "outdated-fingerprint-old";
      resetUpdateStateForTesting();
      mocks.apiClient.get.mockRejectedValueOnce(new Error("Network offline"));

      const res = await checkNativeAppUpdate();
      expect(res.isUpdateRequired).toBe(true);
      expect(res.reason).toBe("runtime_mismatch");
    });

    it("records dismissal timestamp in AsyncStorage and updates isDismissed", async () => {
      await dismissNativeUpdatePrompt();
      expect(mocks.asyncStorage.setItem).toHaveBeenCalledWith(
        "synx_native_update_dismissed_at",
        expect.any(String)
      );
      expect(getUpdateState().nativeUpdate.isDismissed).toBe(true);
    });

    it("markNativeUpdateRequired marks update required when signaled by response headers", () => {
      markNativeUpdateRequired({ downloadUrl: "https://synx.christran.io/download/android" });
      const state = getUpdateState();
      expect(state.nativeUpdate.isUpdateRequired).toBe(true);
      expect(state.nativeUpdate.downloadUrl).toBe("https://synx.christran.io/download/android");
    });

    it("checkForUpdate returns isNativeUpdateRequired: true when native update is required", async () => {
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.constants.nativeAppVersion = "3.8.0";
      mocks.updates.isEnabled = true;
      mocks.updates.runtimeVersion = "outdated-fingerprint-old";
      resetUpdateStateForTesting();

      mocks.updates.checkForUpdateAsync.mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: false,
      });

      const result = await checkForUpdate({ manual: true });
      expect(result.hasUpdate).toBe(false);
      expect(result.isNativeUpdateRequired).toBe(true);
      expect(result.nativeUpdateUrl).toBeDefined();
    });

    it("checkForUpdate returns isNativeUpdateRequired: true even when Updates.isEnabled is false", async () => {
      mocks.application.nativeApplicationVersion = "3.8.0";
      mocks.constants.nativeAppVersion = "3.8.0";
      mocks.updates.isEnabled = false;
      mocks.updates.runtimeVersion = "outdated-fingerprint-old";
      resetUpdateStateForTesting();

      const result = await checkForUpdate({ manual: true });
      expect(result.hasUpdate).toBe(false);
      expect(result.isNativeUpdateRequired).toBe(true);
    });
  });
});
