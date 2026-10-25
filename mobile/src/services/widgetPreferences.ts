import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEY_LAST_ACTIVE_LIST_ID = "synx_last_active_list_id";
export const STORAGE_KEY_PINNED_WIDGET_CONFIG = "synx_pinned_widget_config";

export interface PinnedWidgetConfig {
  mode: "list" | "reminders";
  listId: string;
}

/**
 * Gets the last viewed active list ID from local device storage.
 */
export async function getLastActiveListId(): Promise<string | null> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY_LAST_ACTIVE_LIST_ID);
    return val && val.trim().length > 0 ? val.trim() : null;
  } catch (e) {
    console.warn("[widgetPreferences] Failed to read last active list id:", e);
    return null;
  }
}

/**
 * Persists the last viewed active list ID so widgets and app restart open the correct list.
 */
export async function setLastActiveListId(listId: string | null): Promise<void> {
  try {
    if (listId && listId.trim().length > 0) {
      await AsyncStorage.setItem(STORAGE_KEY_LAST_ACTIVE_LIST_ID, listId.trim());
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_LAST_ACTIVE_LIST_ID);
    }
  } catch (e) {
    console.warn("[widgetPreferences] Failed to persist last active list id:", e);
  }
}

/**
 * Gets the pinned widget configuration (which list is pinned to the PinnedListWidget).
 */
export async function getPinnedWidgetConfig(): Promise<PinnedWidgetConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PINNED_WIDGET_CONFIG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.listId === "string") {
      return {
        mode: parsed.mode === "reminders" ? "reminders" : "list",
        listId: parsed.listId,
      };
    }
    return null;
  } catch (e) {
    console.warn("[widgetPreferences] Failed to read pinned widget config:", e);
    return null;
  }
}

/**
 * Saves or updates the pinned widget configuration.
 */
export async function setPinnedWidgetConfig(config: PinnedWidgetConfig | null): Promise<void> {
  try {
    if (config && config.listId) {
      await AsyncStorage.setItem(STORAGE_KEY_PINNED_WIDGET_CONFIG, JSON.stringify(config));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_PINNED_WIDGET_CONFIG);
    }
  } catch (e) {
    console.warn("[widgetPreferences] Failed to persist pinned widget config:", e);
  }
}

/**
 * Clears widget preferences (e.g., on logout).
 */
export async function clearWidgetPreferences(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_LAST_ACTIVE_LIST_ID,
      STORAGE_KEY_PINNED_WIDGET_CONFIG,
    ]);
  } catch (e) {
    console.warn("[widgetPreferences] Failed to clear widget preferences:", e);
  }
}
