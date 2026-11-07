import AsyncStorage from "@react-native-async-storage/async-storage";

export type ListsViewMode = "simple" | "details";

export const LISTS_VIEW_MODE_STORAGE_KEY = "synx_lists_view_mode_v1";

/**
 * Retrieves the preferred Lists screen view mode from AsyncStorage.
 * Defaults to "simple" if unset or on storage read failure.
 */
export async function getListsViewMode(): Promise<ListsViewMode> {
  try {
    const stored = await AsyncStorage.getItem(LISTS_VIEW_MODE_STORAGE_KEY);
    if (stored === "simple" || stored === "details") {
      return stored;
    }
    return "simple";
  } catch (e) {
    console.error("Failed to read lists view mode preference", e);
    return "simple";
  }
}

/**
 * Persists the preferred Lists screen view mode to AsyncStorage.
 */
export async function setListsViewMode(mode: ListsViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(LISTS_VIEW_MODE_STORAGE_KEY, mode);
  } catch (e) {
    console.error("Failed to save lists view mode preference", e);
  }
}
