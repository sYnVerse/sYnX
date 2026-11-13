import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_NATIVE_UPDATE_CONFIG,
  checkNativeUpdateRequired,
  isNativeUpdateDismissed,
  NATIVE_UPDATE_DISMISSED_AT_KEY,
  type NativeUpdateReason,
} from "../shared";
import { apiClient, onNativeUpdateRequired } from "../api/client";
import { MOBILE_APP_VERSION } from "../shared/mobile-version";

export const UPDATE_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface NativeUpdateState {
  isUpdateRequired: boolean;
  isBlocking: boolean;
  reason: NativeUpdateReason | null;
  message: string | null;
  downloadUrl: string;
  latestVersion: string | null;
  latestBuildVersion: number | null;
  latestRuntimeVersion: string | null;
  isDismissed: boolean;
}

export interface UpdateState {
  isEnabled: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean; // Downloaded update or rollback directive waiting for restart
  isRollBackToEmbedded: boolean; // Server-directed rollback to embedded bundle is ready/applied
  isEmergencyLaunch: boolean;
  isEmbeddedLaunch: boolean;
  lastCheckedAt: number | null;
  updateError: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  channel: string | null;
  nativeAppVersion: string | null;
  nativeBuildVersion: string | null;
  nativeUpdate: NativeUpdateState;
}

export interface CheckForUpdateResult {
  hasUpdate: boolean;
  isRollBack?: boolean;
  isNativeUpdateRequired?: boolean;
  nativeUpdateUrl?: string;
  nativeUpdateMessage?: string;
  error?: string;
}

function resolveNativeAppVersion(): string | null {
  return (
    Application.nativeApplicationVersion ??
    (Constants as any)?.nativeAppVersion ??
    Constants.expoConfig?.version ??
    null
  );
}

function resolveNativeBuildVersion(): string | null {
  return (
    Application.nativeBuildVersion ??
    (Constants as any)?.nativeBuildVersion ??
    (Constants.expoConfig?.android?.versionCode
      ? String(Constants.expoConfig.android.versionCode)
      : null) ??
    (Constants.expoConfig?.ios?.buildNumber ?? null)
  );
}

export const defaultNativeUpdateState: NativeUpdateState = {
  isUpdateRequired: false,
  isBlocking: false,
  reason: null,
  message: null,
  downloadUrl: DEFAULT_NATIVE_UPDATE_CONFIG.android.downloadUrl,
  latestVersion: null,
  latestBuildVersion: null,
  latestRuntimeVersion: null,
  isDismissed: false,
};

let currentState: UpdateState = {
  isEnabled: Updates.isEnabled ?? false,
  isChecking: false,
  isDownloading: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
  isRollBackToEmbedded: false,
  isEmergencyLaunch: Updates.isEmergencyLaunch ?? false,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch ?? true,
  lastCheckedAt: null,
  updateError: null,
  runtimeVersion: Updates.runtimeVersion ?? null,
  updateId: Updates.updateId ?? null,
  channel: Updates.channel ?? null,
  nativeAppVersion: resolveNativeAppVersion(),
  nativeBuildVersion: resolveNativeBuildVersion(),
  nativeUpdate: { ...defaultNativeUpdateState },
};

type StateListener = (state: UpdateState) => void;
const listeners = new Set<StateListener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(currentState);
    } catch (e) {
      console.warn("[updates] Error in update listener:", e);
    }
  }
}

function updateState(patch: Partial<UpdateState>): void {
  currentState = { ...currentState, ...patch };
  notifyListeners();
}

/**
 * Marks native update as required, triggered when API response contains
 * X-sYnX-Native-Update-Required header or when manual/periodic check finds an outdated binary.
 */
export function markNativeUpdateRequired(options?: { downloadUrl?: string }): void {
  updateState({
    nativeUpdate: {
      ...currentState.nativeUpdate,
      isUpdateRequired: true,
      downloadUrl: options?.downloadUrl || currentState.nativeUpdate.downloadUrl,
      message:
        currentState.nativeUpdate.message ||
        "A native app update is required. Over-The-Air updates are no longer supported on this build.",
    },
  });
}

// Wire up API client header trigger
onNativeUpdateRequired(markNativeUpdateRequired);

/**
 * Synchronizes native Expo Updates state (e.g. startup downloads or rollback directives)
 * from the native state machine context into the JavaScript state singleton.
 * Reconciles state in both directions (setting and clearing flags).
 */
export function syncNativeUpdateContext(context?: any): void {
  const ctx = context ?? (Updates as any).latestContext;
  if (!ctx) return;

  const isPending = Boolean(ctx.isUpdatePending);
  const isAvailable = Boolean(ctx.isUpdateAvailable);
  // Rollback readiness is only valid when an update is pending AND is a rollback (not superseded by a normal manifest)
  const isRollBack = isPending && Boolean(ctx.rollback && !ctx.downloadedManifest);

  const patch: Partial<UpdateState> = {};

  if (typeof ctx.isUpdatePending === "boolean") {
    patch.isUpdatePending = isPending;
    patch.isRollBackToEmbedded = isRollBack;
  }
  if (typeof ctx.isUpdateAvailable === "boolean") {
    patch.isUpdateAvailable = isAvailable;
  }
  if (typeof ctx.isChecking === "boolean") {
    patch.isChecking = ctx.isChecking;
  }
  if (typeof ctx.isDownloading === "boolean") {
    patch.isDownloading = ctx.isDownloading;
  }

  const hasChanges = Object.keys(patch).some(
    (key) => (currentState as any)[key] !== (patch as any)[key]
  );
  if (hasChanges) {
    updateState(patch);
  }
}

let nativeSubscription: { remove: () => void } | null = null;

/**
 * Subscribes to Expo's native state change events to immediately catch
 * startup-downloaded updates, background fetches, or rollback directives.
 */
export function registerNativeUpdatesListener(): () => void {
  if (typeof (Updates as any).addUpdatesStateChangeListener !== "function") {
    return () => {};
  }
  if (nativeSubscription) {
    return () => {
      nativeSubscription?.remove();
      nativeSubscription = null;
    };
  }

  try {
    const sub = (Updates as any).addUpdatesStateChangeListener((event: any) => {
      if (event?.context) {
        syncNativeUpdateContext(event.context);
      }
    });
    nativeSubscription = sub;
    return () => {
      sub.remove();
      nativeSubscription = null;
    };
  } catch (e) {
    console.warn("[updates] Failed to register native updates state listener:", e);
    return () => {};
  }
}

// Initial sync on module load
syncNativeUpdateContext();
registerNativeUpdatesListener();

/**
 * Bridges native update state from an object (e.g. from Updates.useUpdates())
 * into the sYnX update state singleton, reconciling both true and false transitions.
 */
export function bridgeNativeUpdatesState(nativeState: any): void {
  if (!nativeState) return;

  const isPending = Boolean(nativeState.isUpdatePending);
  const isAvailable = Boolean(nativeState.isUpdateAvailable);
  const isRollBack = isPending && Boolean(
    nativeState.downloadedUpdate?.type === "rollback" ||
    (!nativeState.downloadedUpdate?.manifest && nativeState.availableUpdate?.type === "rollback")
  );

  const patch: Partial<UpdateState> = {
    isUpdatePending: isPending,
    isUpdateAvailable: isAvailable,
    isRollBackToEmbedded: isRollBack,
  };

  if (typeof nativeState.isChecking === "boolean") {
    patch.isChecking = nativeState.isChecking;
  }
  if (typeof nativeState.isDownloading === "boolean") {
    patch.isDownloading = nativeState.isDownloading;
  }

  const hasChanges = Object.keys(patch).some(
    (key) => (currentState as any)[key] !== (patch as any)[key]
  );
  if (hasChanges) {
    updateState(patch);
  }
}

/**
 * React hook to bridge Expo's native Updates.useUpdates() hook
 * into the sYnX update state singleton from a React component.
 */
export function useUpdatesBridge(): void {
  const nativeState = typeof (Updates as any).useUpdates === "function" ? (Updates as any).useUpdates() : null;

  useEffect(() => {
    if (nativeState) {
      bridgeNativeUpdatesState(nativeState);
    }
  }, [nativeState]);
}

/**
 * Resets update state to default values for test isolation.
 */
export function resetUpdateStateForTesting(): void {
  currentState = {
    isEnabled: Updates.isEnabled ?? false,
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
    isRollBackToEmbedded: false,
    isEmergencyLaunch: Updates.isEmergencyLaunch ?? false,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch ?? true,
    lastCheckedAt: null,
    updateError: null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
    channel: Updates.channel ?? null,
    nativeAppVersion: resolveNativeAppVersion(),
    nativeBuildVersion: resolveNativeBuildVersion(),
    nativeUpdate: { ...defaultNativeUpdateState },
  };
  syncNativeUpdateContext();
}

/**
 * Returns the current OTA update state.
 */
export function getUpdateState(): UpdateState {
  return currentState;
}

/**
 * Subscribes to updates state changes. Returns an unsubscribe function.
 */
export function subscribeUpdateState(listener: StateListener): () => void {
  syncNativeUpdateContext();
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Formats a short identifier (e.g. first 7 characters of a hash or UUID)
 * for compact display in diagnostics.
 */
export function formatShortId(id: string | null | undefined, fallback = "None"): string {
  if (!id) return fallback;
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Evaluates whether a native application update is required.
 * First evaluates against embedded/default configuration, then queries the server
 * API (/api/v1/mobile/version) for any dynamic or remote updates to the floor.
 */
export async function checkNativeAppUpdate(): Promise<NativeUpdateState> {
  if (Platform.OS === "web") {
    return currentState.nativeUpdate;
  }

  const currentAppVersion = currentState.nativeAppVersion || MOBILE_APP_VERSION;
  const currentBuildVersion = currentState.nativeBuildVersion;
  const currentRuntime = currentState.runtimeVersion;

  let isDismissed = false;
  try {
    const rawDismissed = await AsyncStorage.getItem(NATIVE_UPDATE_DISMISSED_AT_KEY);
    if (rawDismissed) {
      isDismissed = isNativeUpdateDismissed(parseInt(rawDismissed, 10));
    }
  } catch {
    // Ignore storage read error
  }

  const platformKey = Platform.OS === "ios" ? "ios" : "android";
  const localConfig = DEFAULT_NATIVE_UPDATE_CONFIG[platformKey] || DEFAULT_NATIVE_UPDATE_CONFIG.android;

  const localEval = checkNativeUpdateRequired(
    {
      platform: Platform.OS,
      appVersion: currentAppVersion,
      buildVersion: currentBuildVersion,
      runtimeVersion: currentRuntime,
    },
    localConfig
  );

  let nativeResult: NativeUpdateState = {
    isUpdateRequired: localEval.updateRequired,
    isBlocking: localEval.isBlocking,
    reason: localEval.reason,
    message: localEval.message,
    downloadUrl: localEval.downloadUrl,
    latestVersion: localEval.latestVersion,
    latestBuildVersion: localEval.latestBuildVersion ?? null,
    latestRuntimeVersion: localEval.latestRuntimeVersion ?? null,
    isDismissed,
  };

  try {
    const res = await apiClient.get("/api/v1/mobile/version", {
      params: {
        platform: Platform.OS,
        version: currentAppVersion,
        build: currentBuildVersion,
        runtimeVersion: currentRuntime,
      },
      skipAuthRefresh: true,
      timeout: 5000,
    });
    if (res.data && typeof res.data.updateRequired === "boolean") {
      nativeResult = {
        isUpdateRequired: Boolean(res.data.updateRequired),
        isBlocking: Boolean(res.data.isBlocking),
        reason: res.data.reason || null,
        message: res.data.message || null,
        downloadUrl: res.data.downloadUrl || localEval.downloadUrl,
        latestVersion: res.data.latest?.latestVersion || localEval.latestVersion,
        latestBuildVersion: res.data.latest?.latestBuildVersion ?? null,
        latestRuntimeVersion: res.data.latest?.latestRuntimeVersion ?? null,
        isDismissed,
      };
    }
  } catch {
    // Retain local evaluation on network failure
  }

  updateState({ nativeUpdate: nativeResult });
  return nativeResult;
}

/**
 * Dismisses the soft native update banner/prompt for 24 hours.
 */
export async function dismissNativeUpdatePrompt(): Promise<void> {
  const now = Date.now();
  try {
    await AsyncStorage.setItem(NATIVE_UPDATE_DISMISSED_AT_KEY, String(now));
  } catch {}
  updateState({
    nativeUpdate: {
      ...currentState.nativeUpdate,
      isDismissed: true,
    },
  });
}

/**
 * Checks for available updates and downloads any compatible update or rollback in the background.
 * Also verifies native update requirements to alert users if Over-The-Air updates are no longer supported.
 * Automatically throttled unless manual: true is specified.
 */
export async function checkForUpdate(options?: {
  manual?: boolean;
}): Promise<CheckForUpdateResult> {
  if (Platform.OS === "web") {
    return { hasUpdate: false };
  }

  const nativeCheckPromise = checkNativeAppUpdate().catch(() => currentState.nativeUpdate);

  if (!Updates.isEnabled) {
    const nativeResult = await nativeCheckPromise;
    updateState({ isChecking: false, updateError: null });
    if (nativeResult.isUpdateRequired) {
      return {
        hasUpdate: false,
        isNativeUpdateRequired: true,
        nativeUpdateUrl: nativeResult.downloadUrl,
        nativeUpdateMessage: nativeResult.message || undefined,
      };
    }
    return { hasUpdate: false, error: "OTA updates are disabled in this build." };
  }

  // Throttle automatic checks
  const now = Date.now();
  if (!options?.manual && currentState.lastCheckedAt) {
    if (now - currentState.lastCheckedAt < UPDATE_CHECK_COOLDOWN_MS) {
      const nativeResult = await nativeCheckPromise;
      return {
        hasUpdate: currentState.isUpdatePending,
        isRollBack: currentState.isRollBackToEmbedded,
        isNativeUpdateRequired: nativeResult.isUpdateRequired,
        nativeUpdateUrl: nativeResult.downloadUrl,
        nativeUpdateMessage: nativeResult.message || undefined,
      };
    }
  }

  if (currentState.isChecking || currentState.isDownloading) {
    const nativeResult = await nativeCheckPromise;
    return {
      hasUpdate: currentState.isUpdatePending,
      isRollBack: currentState.isRollBackToEmbedded,
      isNativeUpdateRequired: nativeResult.isUpdateRequired,
      nativeUpdateUrl: nativeResult.downloadUrl,
      nativeUpdateMessage: nativeResult.message || undefined,
    };
  }

  updateState({ isChecking: true, updateError: null });

  try {
    const checkResult = await Updates.checkForUpdateAsync();
    const isAvailable = Boolean(checkResult.isAvailable);
    const isRollBack = Boolean((checkResult as any).isRollBackToEmbedded);
    const shouldFetch = isAvailable || isRollBack;

    updateState({
      isChecking: false,
      lastCheckedAt: now,
      isUpdateAvailable: shouldFetch,
    });

    if (shouldFetch) {
      updateState({ isDownloading: true });
      const fetchResult = await Updates.fetchUpdateAsync();
      const isRollBackPending = Boolean((fetchResult as any).isRollBackToEmbedded);
      const isPending = Boolean(fetchResult.isNew || isRollBackPending);

      updateState({
        isDownloading: false,
        isUpdatePending: isPending,
        isRollBackToEmbedded: isRollBackPending,
      });
      const nativeResult = await nativeCheckPromise;
      return {
        hasUpdate: isPending,
        isRollBack: isRollBackPending,
        isNativeUpdateRequired: nativeResult.isUpdateRequired,
        nativeUpdateUrl: nativeResult.downloadUrl,
        nativeUpdateMessage: nativeResult.message || undefined,
      };
    }

    updateState({
      isDownloading: false,
      isUpdateAvailable: false,
      isRollBackToEmbedded: false,
    });
    const nativeResult = await nativeCheckPromise;
    return {
      hasUpdate: false,
      isRollBack: false,
      isNativeUpdateRequired: nativeResult.isUpdateRequired,
      nativeUpdateUrl: nativeResult.downloadUrl,
      nativeUpdateMessage: nativeResult.message || undefined,
    };
  } catch (err: any) {
    const message = err?.message || "Failed to check for updates.";
    console.warn("[updates] Update check/download failed:", message);
    const nativeResult = await nativeCheckPromise;
    updateState({
      isChecking: false,
      isDownloading: false,
      updateError: message,
    });
    return {
      hasUpdate: false,
      isNativeUpdateRequired: nativeResult.isUpdateRequired,
      nativeUpdateUrl: nativeResult.downloadUrl,
      nativeUpdateMessage: nativeResult.message || undefined,
      error: message,
    };
  }
}

/**
 * Reloads the app to apply a downloaded update or rollback to embedded.
 * Only call this after ensuring active user edits are saved or confirmed.
 */
export async function reloadToApplyUpdate(): Promise<boolean> {
  if (!Updates.isEnabled || !currentState.isUpdatePending) {
    return false;
  }

  try {
    await Updates.reloadAsync();
    return true;
  } catch (e: any) {
    console.error("[updates] Failed to reload application:", e);
    updateState({ updateError: e?.message || "Failed to reload update." });
    return false;
  }
}

/**
 * Initializes the background update checking service.
 * - Bridges native Expo state change events
 * - Performs a throttled background check on startup (delayed by 3 seconds)
 * - Listens for AppState active transitions to perform throttled checks
 */
export function startPeriodicUpdateService(): () => void {
  if (Platform.OS === "web" || !Updates.isEnabled) {
    return () => {};
  }

  // Ensure native state listener is active and context is synced
  syncNativeUpdateContext();
  const unregisterNative = registerNativeUpdatesListener();

  // Delayed initial check after cold launch
  const initialTimer = setTimeout(() => {
    void checkForUpdate({ manual: false });
  }, 3000);

  const sub = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") {
      syncNativeUpdateContext();
      void checkForUpdate({ manual: false });
    }
  });

  return () => {
    clearTimeout(initialTimer);
    sub.remove();
    unregisterNative();
  };
}
