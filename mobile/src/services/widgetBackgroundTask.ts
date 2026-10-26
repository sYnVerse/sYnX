import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { BackgroundTaskResult } from 'expo-background-task';
import { Platform } from 'react-native';
import { drainAndReplayPendingWidgetOps, syncAllWidgets } from './widgetSync';

export const WIDGET_BACKGROUND_SYNC_TASK = 'synx-widget-background-sync';

// Define the task outside of components (required by expo-task-manager)
TaskManager.defineTask(WIDGET_BACKGROUND_SYNC_TASK, async () => {
  try {
    // 1. Replay checkoffs queued in the Current and Pinned list widgets. This uses the
    //    same path as the app, so ops that fail for a temporary reason stay queued.
    await drainAndReplayPendingWidgetOps();

    // 2. Refresh the active list (Current + Progress widgets) and the pinned list,
    //    including when the pinned list is the active list. Rebuilds keep any
    //    still-queued taps.
    await syncAllWidgets();

    return BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[widgetBackgroundTask] Background sync failed:', error);
    return BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the periodic background task with expo-background-task.
 */
export async function registerWidgetBackgroundSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WIDGET_BACKGROUND_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(WIDGET_BACKGROUND_SYNC_TASK, {
        minimumInterval: 15, // 15 minutes minimum interval
      });
      console.log('[widgetBackgroundTask] Registered background widget sync task');
    }
  } catch (e) {
    console.warn('[widgetBackgroundTask] Failed to register background task:', e);
  }
}
