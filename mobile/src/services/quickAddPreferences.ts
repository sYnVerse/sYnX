import AsyncStorage from "@react-native-async-storage/async-storage";

/** App-wide Smart Quick Add preference, saved on this device only (defaults to on). */
export const STORAGE_KEY_SMART_QUICK_ADD = "SYNX_SMART_QUICK_ADD_ENABLED";

let currentEnabled = true;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: boolean) {
  currentEnabled = next;
  listeners.forEach((listener) => listener());
}

/** Reads the saved Smart Quick Add setting once; later calls reuse the first read. */
export function loadQuickAddPreferences(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY_SMART_QUICK_ADD);
        if (saved === "false" || saved === "true") {
          emit(saved !== "false");
        }
      } catch (e) {
        console.warn("[quickAddPreferences] Failed to read smart quick add setting:", e);
      }
    })();
  }
  return loadPromise;
}

export function getSmartQuickAddEnabled(): boolean {
  return currentEnabled;
}

export function subscribeQuickAddPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Enables or disables Smart Quick Add on this device. Updates subscribers
 * right away; storage persistence is best effort.
 */
export async function setSmartQuickAddEnabled(enabled: boolean): Promise<void> {
  await loadQuickAddPreferences();
  emit(enabled);
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SMART_QUICK_ADD, enabled ? "true" : "false");
  } catch (e) {
    console.warn("[quickAddPreferences] Failed to save smart quick add setting:", e);
  }
}

/** Resets cached state back to defaults (intended for unit tests). */
export function resetQuickAddPreferencesForTest(): void {
  loadPromise = null;
  currentEnabled = true;
  listeners.clear();
}
