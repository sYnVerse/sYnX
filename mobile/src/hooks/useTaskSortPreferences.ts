import { useEffect, useSyncExternalStore } from "react";
import {
  getTaskSortPreferences,
  loadTaskSortPreferences,
  subscribeTaskSortPreferences,
  type TaskSortPreferences,
} from "../services/taskSortPreferences";

/** The app-wide task sort and per-list overrides, kept in sync across screens. */
export function useTaskSortPreferences(): TaskSortPreferences {
  useEffect(() => {
    void loadTaskSortPreferences();
  }, []);
  return useSyncExternalStore(subscribeTaskSortPreferences, getTaskSortPreferences);
}
