import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { BackgroundTaskResult } from 'expo-background-task';
import { Platform } from 'react-native';
import CurrentListWidget from '../widgets/CurrentListWidget';
import PinnedListWidget from '../widgets/PinnedListWidget';
import ListProgressWidget from '../widgets/ListProgressWidget';
import { getLastActiveListId, getPinnedWidgetConfig } from './widgetPreferences';
import {
  buildListWidgetSnapshot,
  buildUpNextWidgetSnapshot,
  buildProgressWidgetSnapshot,
  extractPendingWidgetOps,
  reconcileWidgetPendingOps,
  type TodoItem,
  type TodoList,
} from '../shared';
import { apiClient } from '../api/client';

export const WIDGET_BACKGROUND_SYNC_TASK = 'synx-widget-background-sync';

// Define the task outside of components (required by expo-task-manager)
TaskManager.defineTask(WIDGET_BACKGROUND_SYNC_TASK, async () => {
  try {
    // 1. Drain pending operations first
    if (Platform.OS === 'android') {
      const currentSnap = CurrentListWidget.getSnapshot?.() as Record<string, any> | null;
      const pinnedSnap = PinnedListWidget.getSnapshot?.() as Record<string, any> | null;

      const allOps = [
        ...extractPendingWidgetOps(currentSnap),
        ...extractPendingWidgetOps(pinnedSnap),
      ];

      const reconciled = reconcileWidgetPendingOps(allOps);
      for (const op of reconciled) {
        try {
          await apiClient.post(`/api/v1/todos/${op.todoId}/completed`, {
            completed: op.completed,
          });
        } catch {
          // Ignore individual op failure in background
        }
      }

      if (currentSnap && Array.isArray(currentSnap.pendingOps) && currentSnap.pendingOps.length > 0) {
        CurrentListWidget.updateSnapshot({ ...currentSnap, pendingOps: [] } as any);
      }
      if (pinnedSnap && Array.isArray(pinnedSnap.pendingOps) && pinnedSnap.pendingOps.length > 0) {
        PinnedListWidget.updateSnapshot({ ...pinnedSnap, pendingOps: [] } as any);
      }
    }

    // 2. Fetch fresh list metadata and todos for active list
    const activeListId = await getLastActiveListId();
    const pinnedConfig = await getPinnedWidgetConfig();

    if (activeListId) {
      try {
        const [metaRes, todosRes] = await Promise.all([
          apiClient.get(`/api/v1/lists/${activeListId}/meta`),
          apiClient.get(`/api/v1/todos?listId=${activeListId}`),
        ]);
        const listMeta = metaRes.data?.list as TodoList | undefined;
        const todos = (todosRes.data?.todos || []) as TodoItem[];
        if (listMeta) {
          CurrentListWidget.updateSnapshot(buildListWidgetSnapshot(listMeta, todos));
          ListProgressWidget.updateSnapshot(buildProgressWidgetSnapshot(listMeta, todos));
        }
      } catch {
        // Network or token refresh error
      }
    }

    // 3. Fetch fresh list metadata and todos for pinned list if distinct
    const pinnedListId = pinnedConfig?.listId || activeListId;
    if (pinnedListId && pinnedListId !== activeListId) {
      try {
        const [metaRes, todosRes] = await Promise.all([
          apiClient.get(`/api/v1/lists/${pinnedListId}/meta`),
          apiClient.get(`/api/v1/todos?listId=${pinnedListId}`),
        ]);
        const pinnedMeta = metaRes.data?.list as TodoList | undefined;
        const pinnedTodos = (todosRes.data?.todos || []) as TodoItem[];
        if (pinnedMeta) {
          if (pinnedConfig?.mode === 'reminders') {
            PinnedListWidget.updateSnapshot(buildUpNextWidgetSnapshot(pinnedMeta, pinnedTodos));
          } else {
            PinnedListWidget.updateSnapshot(buildListWidgetSnapshot(pinnedMeta, pinnedTodos));
          }
        }
      } catch {
        // Network or token refresh error
      }
    }

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
