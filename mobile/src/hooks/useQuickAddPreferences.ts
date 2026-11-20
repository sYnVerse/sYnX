import { useEffect, useSyncExternalStore } from "react";
import {
  getSmartQuickAddEnabled,
  loadQuickAddPreferences,
  subscribeQuickAddPreferences,
} from "../services/quickAddPreferences";

/** Whether Smart Quick Add parsing is enabled for new tasks on this device. */
export function useQuickAddPreferences(): boolean {
  useEffect(() => {
    void loadQuickAddPreferences();
  }, []);
  return useSyncExternalStore(subscribeQuickAddPreferences, getSmartQuickAddEnabled);
}
