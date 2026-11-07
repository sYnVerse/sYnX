import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

export const UPDATE_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

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
}

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
  nativeAppVersion: Constants.nativeAppVersion ?? null,
  nativeBuildVersion: Constants.nativeBuildVersion ?? null,
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
 * Synchronizes native Expo Updates state (e.g. startup downloads or rollback directives)
 * from the native state machine context into the JavaScript state singleton.
 */
export function syncNativeUpdateContext(context?: any): void {
  const ctx = context ?? (Updates as any).latestContext;
  if (!ctx) return;

  const isPending = Boolean(ctx.isUpdatePending || ctx.rollback || ctx.downloadedManifest);
  const isAvailable = Boolean(ctx.isUpdateAvailable || ctx.latestManifest || ctx.rollback);
  const isRollBack = Boolean(ctx.rollback);

  const patch: Partial<UpdateState> = {};
  if (isPending && !currentState.isUpdatePending) {
    patch.isUpdatePending = true;
  }
  if (isAvailable && !currentState.isUpdateAvailable) {
    patch.isUpdateAvailable = true;
  }
  if (isRollBack && !currentState.isRollBackToEmbedded) {
    patch.isRollBackToEmbedded = true;
  }
  if (typeof ctx.isChecking === "boolean" && ctx.isChecking !== currentState.isChecking) {
    patch.isChecking = ctx.isChecking;
  }
  if (typeof ctx.isDownloading === "boolean" && ctx.isDownloading !== currentState.isDownloading) {
    patch.isDownloading = ctx.isDownloading;
  }

  if (Object.keys(patch).length > 0) {
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
 * into the sYnX update state singleton.
 */
export function bridgeNativeUpdatesState(nativeState: any): void {
  if (!nativeState) return;
  syncNativeUpdateContext({
    isUpdatePending: nativeState.isUpdatePending,
    isUpdateAvailable: nativeState.isUpdateAvailable,
    isChecking: nativeState.isChecking,
    isDownloading: nativeState.isDownloading,
    downloadedManifest: nativeState.downloadedUpdate?.manifest,
    rollback:
      nativeState.downloadedUpdate?.type === "rollback" ||
      nativeState.availableUpdate?.type === "rollback"
        ? { commitTime: new Date().toISOString() }
        : undefined,
  });
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
    nativeAppVersion: Constants.nativeAppVersion ?? null,
    nativeBuildVersion: Constants.nativeBuildVersion ?? null,
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
 * Checks for available updates and downloads any compatible update or rollback in the background.
 * Automatically throttled unless manual: true is specified.
 */
export async function checkForUpdate(options?: {
  manual?: boolean;
}): Promise<{ hasUpdate: boolean; isRollBack?: boolean; error?: string }> {
  if (Platform.OS === "web") {
    return { hasUpdate: false };
  }

  if (!Updates.isEnabled) {
    updateState({ isChecking: false, updateError: null });
    return { hasUpdate: false, error: "OTA updates are disabled in this build." };
  }

  // Throttle automatic checks
  const now = Date.now();
  if (!options?.manual && currentState.lastCheckedAt) {
    if (now - currentState.lastCheckedAt < UPDATE_CHECK_COOLDOWN_MS) {
      return {
        hasUpdate: currentState.isUpdatePending,
        isRollBack: currentState.isRollBackToEmbedded,
      };
    }
  }

  if (currentState.isChecking || currentState.isDownloading) {
    return {
      hasUpdate: currentState.isUpdatePending,
      isRollBack: currentState.isRollBackToEmbedded,
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
      isRollBackToEmbedded: isRollBack,
    });

    if (shouldFetch) {
      updateState({ isDownloading: true });
      const fetchResult = await Updates.fetchUpdateAsync();
      const isPending = Boolean(fetchResult.isNew || (fetchResult as any).isRollBackToEmbedded);
      const isRollBackPending = Boolean((fetchResult as any).isRollBackToEmbedded);

      updateState({
        isDownloading: false,
        isUpdatePending: isPending,
        isRollBackToEmbedded: isRollBackPending || isRollBack,
      });
      return { hasUpdate: isPending, isRollBack: isRollBackPending || isRollBack };
    }

    return { hasUpdate: false };
  } catch (err: any) {
    const message = err?.message || "Failed to check for updates.";
    console.warn("[updates] Update check/download failed:", message);
    updateState({
      isChecking: false,
      isDownloading: false,
      updateError: message,
    });
    return { hasUpdate: false, error: message };
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
