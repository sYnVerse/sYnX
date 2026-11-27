import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "../api/client";
import {
  ARCHIVE_PROMPT_DISMISSED_STORAGE_KEY,
  clearArchivePromptDismissed,
  markArchivePromptDismissed,
  parseDismissedArchivePrompts,
  serializeDismissedArchivePrompts,
} from "../shared";

export const STORAGE_KEY_ARCHIVE_SUGGESTIONS = "SYNX_ARCHIVE_SUGGESTIONS_ENABLED";
export const STORAGE_KEY_ARCHIVE_DISMISSED = ARCHIVE_PROMPT_DISMISSED_STORAGE_KEY;

let suggestionsEnabled = true;
let dismissedListIds = new Set<string>();
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Reads local archive preferences once; subsequent callers share the in-flight promise. */
export function loadArchivePreferences(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [savedEnabled, savedDismissed] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ARCHIVE_SUGGESTIONS),
          AsyncStorage.getItem(STORAGE_KEY_ARCHIVE_DISMISSED),
        ]);
        if (savedEnabled === "false" || savedEnabled === "true") {
          suggestionsEnabled = savedEnabled !== "false";
        }
        dismissedListIds = parseDismissedArchivePrompts(savedDismissed);
        emit();
      } catch (e) {
        console.warn("[archivePreferences] Failed to read archive preferences:", e);
      }
    })();
  }
  return loadPromise;
}

export function getArchiveSuggestionsEnabled(): boolean {
  return suggestionsEnabled;
}

export function getDismissedArchivePrompts(): ReadonlySet<string> {
  return dismissedListIds;
}

export function subscribeArchivePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Updates local cache and AsyncStorage without calling the backend API. */
export async function setArchiveSuggestionsEnabledLocal(enabled: boolean): Promise<void> {
  await loadArchivePreferences();
  if (suggestionsEnabled !== enabled) {
    suggestionsEnabled = enabled;
    emit();
  }
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY_ARCHIVE_SUGGESTIONS,
      enabled ? "true" : "false"
    );
  } catch (e) {
    console.warn("[archivePreferences] Failed to persist local archive suggestions setting:", e);
  }
}

/** Refreshes `archiveSuggestionsEnabled` from `/api/v1/settings`. */
export async function syncArchiveSuggestionsFromServer(): Promise<boolean> {
  await loadArchivePreferences();
  try {
    const res = await apiClient.get("/api/v1/settings");
    const serverVal = res.data?.settings?.archiveSuggestionsEnabled;
    if (typeof serverVal === "boolean") {
      await setArchiveSuggestionsEnabledLocal(serverVal);
      return serverVal;
    }
  } catch (e) {
    console.warn("[archivePreferences] Failed to sync archive suggestions from server:", e);
  }
  return suggestionsEnabled;
}

/**
 * Optimistically updates `archiveSuggestionsEnabled`, persists via `PUT /api/v1/settings`,
 * and rolls back on failure.
 */
export async function updateArchiveSuggestionsPreference(enabled: boolean): Promise<void> {
  await loadArchivePreferences();
  const previous = suggestionsEnabled;
  await setArchiveSuggestionsEnabledLocal(enabled);
  try {
    await apiClient.put("/api/v1/settings", { archiveSuggestionsEnabled: enabled });
  } catch (e) {
    await setArchiveSuggestionsEnabledLocal(previous);
    throw e;
  }
}

export async function dismissArchivePromptForList(listId: string): Promise<void> {
  if (!listId) return;
  await loadArchivePreferences();
  dismissedListIds = markArchivePromptDismissed(dismissedListIds, listId);
  emit();
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY_ARCHIVE_DISMISSED,
      serializeDismissedArchivePrompts(dismissedListIds)
    );
  } catch (e) {
    console.warn("[archivePreferences] Failed to save dismissed archive prompt:", e);
  }
}

export async function clearDismissedArchivePromptForList(listId: string): Promise<void> {
  if (!listId) return;
  await loadArchivePreferences();
  if (!dismissedListIds.has(listId)) return;
  dismissedListIds = clearArchivePromptDismissed(dismissedListIds, listId);
  emit();
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY_ARCHIVE_DISMISSED,
      serializeDismissedArchivePrompts(dismissedListIds)
    );
  } catch (e) {
    console.warn("[archivePreferences] Failed to clear dismissed archive prompt:", e);
  }
}

/** Subscribes a screen to the cached archive suggestion flag and dismissed prompt IDs. */
export function useArchivePreferences(): {
  archiveSuggestionsEnabled: boolean;
  dismissedListIds: ReadonlySet<string>;
} {
  const [state, setState] = useState(() => ({
    archiveSuggestionsEnabled: getArchiveSuggestionsEnabled(),
    dismissedListIds: getDismissedArchivePrompts(),
  }));

  useEffect(() => {
    const sync = () => {
      setState({
        archiveSuggestionsEnabled: getArchiveSuggestionsEnabled(),
        dismissedListIds: getDismissedArchivePrompts(),
      });
    };
    const unsubscribe = subscribeArchivePreferences(sync);
    void loadArchivePreferences().then(sync);
    return unsubscribe;
  }, []);

  return state;
}

/** Resets in-memory state back to defaults (intended for unit tests). */
export function resetArchivePreferencesForTest(): void {
  loadPromise = null;
  suggestionsEnabled = true;
  dismissedListIds = new Set<string>();
  listeners.clear();
}
