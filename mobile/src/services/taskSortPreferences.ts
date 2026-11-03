import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_TASK_SORT_MODE,
  isTaskSortMode,
  type TaskSortMode,
  type TaskSortOverride,
} from "../shared";

/** App-wide task sort, saved on this device only. */
export const STORAGE_KEY_TASK_SORT_MODE = "synx_task_sort_mode";
/** Per-list sort overrides ({ [listId]: TaskSortMode }), saved on this device only. */
export const STORAGE_KEY_TASK_SORT_OVERRIDES = "synx_task_sort_overrides";

export interface TaskSortPreferences {
  appDefault: TaskSortMode;
  overrides: Record<string, TaskSortMode>;
}

let current: TaskSortPreferences = { appDefault: DEFAULT_TASK_SORT_MODE, overrides: {} };
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: TaskSortPreferences) {
  current = next;
  listeners.forEach((listener) => listener());
}

function parseOverrides(raw: string | null): Record<string, TaskSortMode> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, TaskSortMode> = {};
    for (const [listId, mode] of Object.entries(parsed as Record<string, unknown>)) {
      if (isTaskSortMode(mode)) out[listId] = mode;
    }
    return out;
  } catch {
    return {};
  }
}

/** Reads the saved sort settings once; later calls reuse the first read. */
export function loadTaskSortPreferences(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [[, mode], [, overrides]] = await AsyncStorage.multiGet([
          STORAGE_KEY_TASK_SORT_MODE,
          STORAGE_KEY_TASK_SORT_OVERRIDES,
        ]);
        emit({
          appDefault: isTaskSortMode(mode) ? mode : DEFAULT_TASK_SORT_MODE,
          overrides: parseOverrides(overrides),
        });
      } catch (e) {
        console.warn("[taskSortPreferences] Failed to read task sort settings:", e);
      }
    })();
  }
  return loadPromise;
}

export function getTaskSortPreferences(): TaskSortPreferences {
  return current;
}

export function subscribeTaskSortPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes the app-wide sort. The screen updates right away; saving is best effort. */
export async function setAppTaskSortMode(mode: TaskSortMode): Promise<void> {
  // Finish the first read so it can't overwrite this choice.
  await loadTaskSortPreferences();
  emit({ ...current, appDefault: mode });
  try {
    await AsyncStorage.setItem(STORAGE_KEY_TASK_SORT_MODE, mode);
  } catch (e) {
    console.warn("[taskSortPreferences] Failed to save task sort:", e);
  }
}

/** Sets or clears ("app_default") one list's sort override. */
export async function setListTaskSortOverride(listId: string, override: TaskSortOverride): Promise<void> {
  if (!listId) return;
  // Finish the first read so other lists' saved overrides aren't lost.
  await loadTaskSortPreferences();
  const overrides = { ...current.overrides };
  if (isTaskSortMode(override)) {
    overrides[listId] = override;
  } else {
    delete overrides[listId];
  }
  emit({ ...current, overrides });
  try {
    await AsyncStorage.setItem(STORAGE_KEY_TASK_SORT_OVERRIDES, JSON.stringify(overrides));
  } catch (e) {
    console.warn("[taskSortPreferences] Failed to save list sort:", e);
  }
}
