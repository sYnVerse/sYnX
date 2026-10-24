import { AppState, Platform } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import { addUserInteractionListener } from 'expo-widgets';
import CurrentListWidget, { initialSnapshot as initialCurrentSnapshot } from '../widgets/CurrentListWidget';
import PinnedListWidget, { initialSnapshot as initialPinnedSnapshot } from '../widgets/PinnedListWidget';
import ListProgressWidget, { initialProgressSnapshot } from '../widgets/ListProgressWidget';
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

let isDrainingOps = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Resets all widgets to the logged-out state (used on logout).
 */
export function resetWidgetsLoggedOut(): void {
  try {
    CurrentListWidget.updateSnapshot(initialCurrentSnapshot);
    PinnedListWidget.updateSnapshot(initialPinnedSnapshot);
    ListProgressWidget.updateSnapshot(initialProgressSnapshot);
  } catch (e) {
    console.warn('[widgetSync] Error resetting widgets to logged-out state:', e);
  }
}

/**
 * Drains and replays any offline completed tasks queued in Android SharedPreferences via widget getSnapshot().
 */
export async function drainAndReplayPendingWidgetOps(queryClient: QueryClient): Promise<void> {
  if (Platform.OS !== 'android' || isDrainingOps) {
    return;
  }

  isDrainingOps = true;
  try {
    const currentSnap = CurrentListWidget.getSnapshot?.() as Record<string, any> | null;
    const pinnedSnap = PinnedListWidget.getSnapshot?.() as Record<string, any> | null;

    const allOps = [
      ...extractPendingWidgetOps(currentSnap),
      ...extractPendingWidgetOps(pinnedSnap),
    ];

    const reconciled = reconcileWidgetPendingOps(allOps);
    if (reconciled.length === 0) {
      return;
    }

    const affectedListIds = new Set<string>();

    for (const op of reconciled) {
      try {
        await apiClient.post(`/api/v1/todos/${op.todoId}/completed`, {
          completed: op.completed,
        });
        affectedListIds.add(op.listId);
      } catch (err: any) {
        console.warn(`[widgetSync] Failed to replay widget op for todo ${op.todoId}:`, err?.message);
      }
    }

    // Invalidate affected list queries
    for (const listId of affectedListIds) {
      queryClient.invalidateQueries({ queryKey: ['todos', listId] });
      queryClient.invalidateQueries({ queryKey: ['list_meta', listId] });
    }

    // Clear pendingOps from snapshots
    if (currentSnap && Array.isArray(currentSnap.pendingOps) && currentSnap.pendingOps.length > 0) {
      CurrentListWidget.updateSnapshot({
        ...currentSnap,
        pendingOps: [],
      } as any);
    }

    if (pinnedSnap && Array.isArray(pinnedSnap.pendingOps) && pinnedSnap.pendingOps.length > 0) {
      PinnedListWidget.updateSnapshot({
        ...pinnedSnap,
        pendingOps: [],
      } as any);
    }
  } catch (e) {
    console.warn('[widgetSync] Error draining widget pending ops:', e);
  } finally {
    isDrainingOps = false;
  }
}

/**
 * Syncs the current React Query cached list and todo state into widget snapshots.
 */
export async function syncWidgetsFromCache(queryClient: QueryClient): Promise<void> {
  try {
    const activeListId = await getLastActiveListId();
    const pinnedConfig = await getPinnedWidgetConfig();

    if (activeListId) {
      const activeMeta = queryClient.getQueryData<TodoList>(['list_meta', activeListId]);
      const activeTodos = queryClient.getQueryData<TodoItem[]>(['todos', activeListId]);

      if (activeMeta) {
        const currentSnap = buildListWidgetSnapshot(activeMeta, activeTodos);
        CurrentListWidget.updateSnapshot(currentSnap);

        const progressSnap = buildProgressWidgetSnapshot(activeMeta, activeTodos);
        ListProgressWidget.updateSnapshot(progressSnap);
      }
    }

    const pinnedListId = pinnedConfig?.listId || activeListId;
    if (pinnedListId) {
      const pinnedMeta = queryClient.getQueryData<TodoList>(['list_meta', pinnedListId]);
      const pinnedTodos = queryClient.getQueryData<TodoItem[]>(['todos', pinnedListId]);

      if (pinnedMeta) {
        if (pinnedConfig?.mode === 'reminders') {
          const upNextSnap = buildUpNextWidgetSnapshot(pinnedMeta, pinnedTodos);
          PinnedListWidget.updateSnapshot(upNextSnap);
        } else {
          const pinnedSnap = buildListWidgetSnapshot(pinnedMeta, pinnedTodos);
          PinnedListWidget.updateSnapshot(pinnedSnap);
        }
      }
    }
  } catch (e) {
    console.warn('[widgetSync] Error updating widget snapshots from cache:', e);
  }
}

/**
 * Starts the real-time widget synchronization service.
 * - Listens for live widget interactions to immediately drain completions
 * - Observes React Query cache mutations to update widget snapshots
 * - Listens for AppState foreground transitions to replay pending ops
 */
export function startWidgetSyncService(queryClient: QueryClient): () => void {
  // 1. Drain pending ops on initial launch
  drainAndReplayPendingWidgetOps(queryClient);

  // 2. Listen for widget taps while the app is active
  let widgetInteractionSub: { remove: () => void } | null = null;
  try {
    widgetInteractionSub = addUserInteractionListener(() => {
      drainAndReplayPendingWidgetOps(queryClient);
    });
  } catch (e) {
    console.warn('[widgetSync] Could not register user interaction listener:', e);
  }

  // 3. Listen for app foregrounding
  const appStateSub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      drainAndReplayPendingWidgetOps(queryClient);
      syncWidgetsFromCache(queryClient);
    }
  });

  // 4. Subscribe to React Query cache changes (debounced by 300ms)
  const queryCacheUnsub = queryClient.getQueryCache().subscribe((event) => {
    if (
      event?.type === 'updated' &&
      Array.isArray(event.query.queryKey) &&
      ['todos', 'list_meta', 'lists'].includes(String(event.query.queryKey[0]))
    ) {
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
      }
      syncDebounceTimer = setTimeout(() => {
        syncWidgetsFromCache(queryClient);
      }, 300);
    }
  });

  return () => {
    widgetInteractionSub?.remove();
    appStateSub.remove();
    queryCacheUnsub();
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }
  };
}
