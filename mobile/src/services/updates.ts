import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

export const UPDATE_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface UpdateState {
  isEnabled: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean; // Downloaded and waiting for restart
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
 * Resets update state to default values for test isolation.
 */
export function resetUpdateStateForTesting(): void {
  currentState = {
    isEnabled: Updates.isEnabled ?? false,
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
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
 * Checks for available updates and downloads any compatible update in the background.
 * Automatically throttled unless manual: true is specified.
 */
export async function checkForUpdate(options?: {
  manual?: boolean;
}): Promise<{ hasUpdate: boolean; error?: string }> {
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
      return { hasUpdate: currentState.isUpdatePending };
    }
  }

  if (currentState.isChecking || currentState.isDownloading) {
    return { hasUpdate: currentState.isUpdatePending };
  }

  updateState({ isChecking: true, updateError: null });

  try {
    const checkResult = await Updates.checkForUpdateAsync();
    updateState({
      isChecking: false,
      lastCheckedAt: now,
      isUpdateAvailable: checkResult.isAvailable,
    });

    if (checkResult.isAvailable) {
      updateState({ isDownloading: true });
      const fetchResult = await Updates.fetchUpdateAsync();
      updateState({
        isDownloading: false,
        isUpdatePending: fetchResult.isNew,
      });
      return { hasUpdate: fetchResult.isNew };
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
 * Reloads the app to apply a downloaded update.
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
 * - Performs a throttled background check on startup (delayed by 3 seconds)
 * - Listens for AppState active transitions to perform throttled checks
 */
export function startPeriodicUpdateService(): () => void {
  if (Platform.OS === "web" || !Updates.isEnabled) {
    return () => {};
  }

  // Delayed initial check after cold launch
  const initialTimer = setTimeout(() => {
    void checkForUpdate({ manual: false });
  }, 3000);

  const sub = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") {
      void checkForUpdate({ manual: false });
    }
  });

  return () => {
    clearTimeout(initialTimer);
    sub.remove();
  };
}
