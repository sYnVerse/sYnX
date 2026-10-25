import { AppState, Platform } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import { addUserInteractionListener } from 'expo-widgets';
import CurrentListWidget, { initialSnapshot as initialCurrentSnapshot } from '../widgets/CurrentListWidget';
import PinnedListWidget, { initialSnapshot as initialPinnedSnapshot } from '../widgets/PinnedListWidget';
import ListProgressWidget, { initialProgressSnapshot } from '../widgets/ListProgressWidget';
import { getLastActiveListId, getPinnedWidgetConfig, type PinnedWidgetConfig } from './widgetPreferences';
import {
  buildListWidgetSnapshot,
  buildUpNextWidgetSnapshot,
  buildProgressWidgetSnapshot,
  extractPendingWidgetOps,
  reconcileWidgetPendingOps,
  toNativeWidgetProps,
  type TodoItem,
  type TodoList,
} from '../shared';
import { apiClient, secureSessionStore } from '../api/client';

let isDrainingOps = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Resets all widgets to the logged-out state (used on logout).
 */
export function resetWidgetsLoggedOut(): void {
  try {
    CurrentListWidget.updateSnapshot(toNativeWidgetProps(initialCurrentSnapshot));
    PinnedListWidget.updateSnapshot(toNativeWidgetProps(initialPinnedSnapshot));
    ListProgressWidget.updateSnapshot(toNativeWidgetProps(initialProgressSnapshot));
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
      CurrentListWidget.updateSnapshot(toNativeWidgetProps({
        ...currentSnap,
        pendingOps: [],
      } as any));
    }

    if (pinnedSnap && Array.isArray(pinnedSnap.pendingOps) && pinnedSnap.pendingOps.length > 0) {
      PinnedListWidget.updateSnapshot(toNativeWidgetProps({
        ...pinnedSnap,
        pendingOps: [],
      } as any));
    }
  } catch (e) {
    console.warn('[widgetSync] Error draining widget pending ops:', e);
  } finally {
    isDrainingOps = false;
  }
}

/**
 * Resolves list metadata from React Query cache if present; otherwise fetches from API.
 */
export async function resolveListMeta(
  listId: string,
  queryClient?: QueryClient
): Promise<TodoList | null> {
  if (queryClient) {
    const cached = queryClient.getQueryData<TodoList>(['list_meta', listId]);
    if (cached) return cached;

    // Check if it exists in the lists list queries
    const listsAll = queryClient.getQueryData<TodoList[]>(['lists', 'all']);
    const foundAll = listsAll?.find((l) => l.id === listId);
    if (foundAll) {
      queryClient.setQueryData(['list_meta', listId], foundAll);
      return foundAll;
    }

    const listsGeneric = queryClient.getQueryData<TodoList[]>(['lists']);
    const foundGeneric = listsGeneric?.find((l) => l.id === listId);
    if (foundGeneric) {
      queryClient.setQueryData(['list_meta', listId], foundGeneric);
      return foundGeneric;
    }
  }

  // If no auth token, avoid making unauthenticated API calls
  const token = await secureSessionStore.getAccessToken();
  if (!token) return null;

  try {
    const res = await apiClient.get(`/api/v1/lists/${listId}`);
    const list = res.data?.list as TodoList | undefined;
    if (list) {
      queryClient?.setQueryData(['list_meta', listId], list);
      return list;
    }
  } catch (err: any) {
    console.warn(`[widgetSync] Failed to resolve list meta for ${listId}:`, err?.message);
  }

  return null;
}

/**
 * Resolves list todos from React Query cache if present; otherwise fetches from API.
 */
export async function resolveListTodos(
  listId: string,
  queryClient?: QueryClient
): Promise<TodoItem[]> {
  if (queryClient) {
    const cached = queryClient.getQueryData<TodoItem[]>(['todos', listId]);
    if (cached) return cached;

    const preview = queryClient.getQueryData<TodoItem[]>(['active_list_todos_preview', listId]);
    if (preview) {
      queryClient.setQueryData(['todos', listId], preview);
      return preview;
    }
  }

  const token = await secureSessionStore.getAccessToken();
  if (!token) return [];

  try {
    const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
    const todos = (res.data?.todos || []) as TodoItem[];
    queryClient?.setQueryData(['todos', listId], todos);
    return todos;
  } catch (err: any) {
    console.warn(`[widgetSync] Failed to resolve todos for ${listId}:`, err?.message);
    return [];
  }
}

/**
 * Syncs the active list to CurrentListWidget and ListProgressWidget snapshots.
 */
export async function syncActiveList(
  listId?: string | null,
  providedMeta?: TodoList,
  providedTodos?: TodoItem[],
  queryClient?: QueryClient
): Promise<void> {
  try {
    const targetId = listId || (await getLastActiveListId());
    if (!targetId) return;

    const meta = providedMeta || (await resolveListMeta(targetId, queryClient));
    if (!meta) return;

    const todos =
      providedTodos !== undefined ? providedTodos : await resolveListTodos(targetId, queryClient);

    const currentSnap = buildListWidgetSnapshot(meta, todos);
    CurrentListWidget.updateSnapshot(toNativeWidgetProps(currentSnap));

    const progressSnap = buildProgressWidgetSnapshot(meta, todos);
    ListProgressWidget.updateSnapshot(toNativeWidgetProps(progressSnap));
  } catch (e) {
    console.warn('[widgetSync] Error syncing active list widgets:', e);
  }
}

/**
 * Syncs the pinned list to PinnedListWidget snapshot.
 * Pass listId: null to reset PinnedListWidget to its empty/unpinned state.
 */
export async function syncPinnedList(
  listId?: string | null,
  providedMeta?: TodoList,
  providedTodos?: TodoItem[],
  queryClient?: QueryClient
): Promise<void> {
  try {
    if (listId === null) {
      PinnedListWidget.updateSnapshot(toNativeWidgetProps(initialPinnedSnapshot));
      return;
    }

    const pinnedConfig = await getPinnedWidgetConfig();
    const targetId = listId || pinnedConfig?.listId;
    if (!targetId) {
      PinnedListWidget.updateSnapshot(toNativeWidgetProps(initialPinnedSnapshot));
      return;
    }

    const meta = providedMeta || (await resolveListMeta(targetId, queryClient));
    if (!meta) return;

    const todos =
      providedTodos !== undefined ? providedTodos : await resolveListTodos(targetId, queryClient);

    if (pinnedConfig?.mode === 'reminders') {
      const upNextSnap = buildUpNextWidgetSnapshot(meta, todos);
      PinnedListWidget.updateSnapshot(toNativeWidgetProps(upNextSnap));
    } else {
      const pinnedSnap = buildListWidgetSnapshot(meta, todos);
      PinnedListWidget.updateSnapshot(toNativeWidgetProps(pinnedSnap));
    }
  } catch (e) {
    console.warn('[widgetSync] Error syncing pinned list widget:', e);
  }
}

/**
 * Syncs both active and pinned widgets immediately.
 */
export async function syncAllWidgets(queryClient?: QueryClient): Promise<void> {
  try {
    const pinnedConfig = await getPinnedWidgetConfig();
    await Promise.allSettled([
      syncActiveList(undefined, undefined, undefined, queryClient),
      syncPinnedList(pinnedConfig?.listId ?? null, undefined, undefined, queryClient),
    ]);
  } catch (e) {
    console.warn('[widgetSync] Error syncing all widgets:', e);
  }
}

/**
 * Syncs the current React Query cached list and todo state into widget snapshots.
 */
export async function syncWidgetsFromCache(queryClient: QueryClient): Promise<void> {
  await syncAllWidgets(queryClient);
}

/**
 * Starts the real-time widget synchronization service.
 * - Drains pending ops and pushes initial widget snapshots on launch
 * - Listens for live widget interactions to immediately drain completions
 * - Observes React Query cache mutations to update widget snapshots
 * - Listens for AppState foreground transitions to replay pending ops and refresh widgets
 */
export function startWidgetSyncService(queryClient: QueryClient): () => void {
  // 1. Drain pending ops and immediately push initial snapshot sync
  drainAndReplayPendingWidgetOps(queryClient);
  syncAllWidgets(queryClient);

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
      syncAllWidgets(queryClient);
    }
  });

  // 4. Subscribe to React Query cache changes (debounced by 300ms)
  const queryCacheUnsub = queryClient.getQueryCache().subscribe((event) => {
    if (
      event?.type === 'updated' &&
      Array.isArray(event.query.queryKey) &&
      ['todos', 'list_meta', 'lists', 'active_list_todos_preview'].includes(String(event.query.queryKey[0]))
    ) {
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
      }
      syncDebounceTimer = setTimeout(() => {
        syncAllWidgets(queryClient);
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
