import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "../api/client";
import {
  DEFAULT_REMINDER_SNOOZE_MINUTES,
  isValidReminderSnoozeMinutes,
  resolveReminderSnoozeMinutes,
} from "../shared";

export const STORAGE_KEY_SNOOZE_MINUTES = "SYNX_REMINDER_SNOOZE_MINUTES";

let cachedSnoozeMinutes: number = DEFAULT_REMINDER_SNOOZE_MINUTES;
let loadPromise: Promise<number> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Reads local snooze preference once and shares the in-flight promise. */
export function loadSnoozePreferences(): Promise<number> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY_SNOOZE_MINUTES);
        const resolved = resolveReminderSnoozeMinutes(saved);
        if (cachedSnoozeMinutes !== resolved) {
          cachedSnoozeMinutes = resolved;
          emit();
        }
      } catch (e) {
        console.warn("[snoozePreferences] Failed to read snooze preference:", e);
      }
      return cachedSnoozeMinutes;
    })();
  }
  return loadPromise;
}

/**
 * Reads the snooze duration directly from AsyncStorage so background/killed-app
 * notification actions always see the latest persisted value.
 */
export async function readSnoozeMinutesForNotification(): Promise<number> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SNOOZE_MINUTES);
    const resolved = resolveReminderSnoozeMinutes(saved);
    cachedSnoozeMinutes = resolved;
    return resolved;
  } catch (e) {
    console.warn("[snoozePreferences] Failed to read notification snooze preference:", e);
    return DEFAULT_REMINDER_SNOOZE_MINUTES;
  }
}

export function getCachedSnoozeMinutes(): number {
  return cachedSnoozeMinutes;
}

export function subscribeSnoozePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Updates module cache and AsyncStorage without calling the backend API. */
export async function setSnoozeMinutesLocal(minutes: number | null): Promise<number> {
  await loadSnoozePreferences();
  const resolved = resolveReminderSnoozeMinutes(minutes);
  if (cachedSnoozeMinutes !== resolved) {
    cachedSnoozeMinutes = resolved;
    emit();
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SNOOZE_MINUTES, String(resolved));
  } catch (e) {
    console.warn("[snoozePreferences] Failed to save snooze preference locally:", e);
  }
  return resolved;
}

/** Refreshes `snoozeMinutes` from `/api/v1/settings` and caches it locally. */
export async function syncSnoozeMinutesFromServer(): Promise<number> {
  await loadSnoozePreferences();
  try {
    const res = await apiClient.get("/api/v1/settings");
    const serverVal = res.data?.settings?.snoozeMinutes;
    if (isValidReminderSnoozeMinutes(serverVal)) {
      return await setSnoozeMinutesLocal(serverVal);
    }
  } catch (e) {
    console.warn("[snoozePreferences] Failed to sync snooze preference from server:", e);
  }
  return cachedSnoozeMinutes;
}

/**
 * Validates `minutes` (1..1,440 whole minutes), optimistically updates local
 * cache + AsyncStorage, persists via `PUT /api/v1/settings`, and rolls back on failure.
 */
export async function updateSnoozeMinutesPreference(minutes: number): Promise<number> {
  if (!isValidReminderSnoozeMinutes(minutes)) {
    throw new Error("Snooze duration must be a whole number of minutes between 1 and 1,440");
  }
  await loadSnoozePreferences();
  const previous = cachedSnoozeMinutes;
  await setSnoozeMinutesLocal(minutes);
  try {
    const res = await apiClient.put("/api/v1/settings", { snoozeMinutes: minutes });
    const serverVal = res.data?.settings?.snoozeMinutes;
    if (isValidReminderSnoozeMinutes(serverVal)) {
      return await setSnoozeMinutesLocal(serverVal);
    }
    return minutes;
  } catch (e) {
    await setSnoozeMinutesLocal(previous);
    throw e;
  }
}

/** Clears cached snooze preference on sign-out without making network calls. */
export async function clearSnoozePreferences(): Promise<void> {
  loadPromise = null;
  if (cachedSnoozeMinutes !== DEFAULT_REMINDER_SNOOZE_MINUTES) {
    cachedSnoozeMinutes = DEFAULT_REMINDER_SNOOZE_MINUTES;
    emit();
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_SNOOZE_MINUTES);
  } catch (e) {
    console.warn("[snoozePreferences] Failed to remove local snooze preference:", e);
  }
}

/** Subscribes a screen to the cached default snooze duration in minutes. */
export function useSnoozePreferences(): { snoozeMinutes: number } {
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(() => getCachedSnoozeMinutes());

  useEffect(() => {
    const sync = () => {
      setSnoozeMinutes(getCachedSnoozeMinutes());
    };
    const unsubscribe = subscribeSnoozePreferences(sync);
    void loadSnoozePreferences().then(sync);
    return unsubscribe;
  }, []);

  return { snoozeMinutes };
}

/** Resets in-memory state back to defaults (intended for unit tests). */
export function resetSnoozePreferencesForTest(): void {
  loadPromise = null;
  cachedSnoozeMinutes = DEFAULT_REMINDER_SNOOZE_MINUTES;
  listeners.clear();
}
