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
  classifyWidgetReplayError,
  removeHandledWidgetOps,
  mergePendingOpsIntoSnapshot,
  applyReplayedWidgetOpsToTodos,
  type ListWidgetSnapshot,
  type WidgetPendingOp,
  type WidgetReplayOutcome,
  type TodoItem,
  type TodoList,
} from '../shared';
import { apiClient, secureSessionStore } from '../api/client';
import { reconcileTasksWithNativeCalendar } from './calendar';
import { getCachedListName } from './listNames';

let isDrainingOps = false;
let drainRequestedWhileBusy = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

type ListWidgetHandle = typeof CurrentListWidget;

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

function readWidgetSnapshot(widget: ListWidgetHandle): Record<string, any> | null {
  if (Platform.OS !== 'android') return null;
  try {
    return (widget.getSnapshot?.() as Record<string, any> | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes a freshly built list snapshot to a widget without losing taps that
 * are still waiting to be replayed (they stay queued and their tasks stay hidden).
 */
function writeListWidgetSnapshot(widget: ListWidgetHandle, snapshot: ListWidgetSnapshot): void {
  const queued = extractPendingWidgetOps(readWidgetSnapshot(widget));
  widget.updateSnapshot(toNativeWidgetProps(mergePendingOpsIntoSnapshot(snapshot, queued)));
}

/**
 * Removes handled ops from a widget's queue. Re-reads the stored snapshot so
 * taps made while the replay was running are kept.
 */
function clearHandledWidgetOps(widget: ListWidgetHandle, handled: WidgetPendingOp[]): void {
  if (!handled.length) return;
  const snap = readWidgetSnapshot(widget);
  if (!snap || !Array.isArray(snap.pendingOps) || snap.pendingOps.length === 0) return;
  const remaining = removeHandledWidgetOps(extractPendingWidgetOps(snap), handled);
  widget.updateSnapshot(toNativeWidgetProps({ ...snap, pendingOps: remaining } as any));
}

/**
 * Sends one queued widget checkoff to the API. The API resolves the task's own
 * list from its ID, so this works for any list (active, pinned, or shared).
 */
async function replayWidgetOp(op: WidgetPendingOp): Promise<WidgetReplayOutcome> {
  try {
    const res = await apiClient.post(`/api/v1/todos/${op.todoId}/completed`, {
      completed: op.completed,
    });
    return { op, status: 'applied', todo: res.data?.todo as TodoItem | undefined };
  } catch (err: any) {
    const status = classifyWidgetReplayError(err?.response?.status);
    console.warn(`[widgetSync] Failed to replay widget op for todo ${op.todoId} (${status}):`, err?.message);
    return { op, status };
  }
}

/**
 * Replays every checkoff queued in the Current and Pinned list widgets
 * (stored in Android SharedPreferences and read with getSnapshot()).
 *
 * Each op carries the list it was tapped in, so a pinned list that isn't the
 * active list is updated in its own cache entry. Ops that fail for a temporary
 * reason stay queued for the next drain instead of being dropped.
 */
export async function drainAndReplayPendingWidgetOps(queryClient?: QueryClient): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (isDrainingOps) {
    drainRequestedWhileBusy = true;
    return;
  }

  isDrainingOps = true;
  try {
    do {
      drainRequestedWhileBusy = false;

      const allOps = [
        ...extractPendingWidgetOps(readWidgetSnapshot(CurrentListWidget)),
        ...extractPendingWidgetOps(readWidgetSnapshot(PinnedListWidget)),
      ];
      if (allOps.length === 0) continue;

      // Replay only the latest action per task, but clear every queued copy of it.
      const reconciled = reconcileWidgetPendingOps(allOps);
      const outcomes: WidgetReplayOutcome[] = [];
      for (const op of reconciled) {
        outcomes.push(await replayWidgetOp(op));
      }

      const handledTodoIds = new Set(
        outcomes.filter((o) => o.status !== 'retry').map((o) => o.op.todoId)
      );
      const handled = allOps.filter((op) => handledTodoIds.has(op.todoId));

      if (queryClient) {
        const outcomesByList = new Map<string, WidgetReplayOutcome[]>();
        for (const outcome of outcomes) {
          if (outcome.status !== 'applied') continue;
          const list = outcomesByList.get(outcome.op.listId) ?? [];
          list.push(outcome);
          outcomesByList.set(outcome.op.listId, list);
        }

        for (const [listId, listOutcomes] of outcomesByList) {
          // Update the cached tasks right away, so a widget rebuild from cache (or the
          // list screen) can't bring the task back as open while the refetch runs.
          queryClient.setQueryData<TodoItem[]>(['todos', listId], (old) =>
            applyReplayedWidgetOpsToTodos(old, listOutcomes)
          );
          queryClient.setQueryData<TodoItem[]>(['active_list_todos_preview', listId], (old) =>
            applyReplayedWidgetOpsToTodos(old, listOutcomes)
          );
          // refetchType 'all' also refreshes lists that aren't on screen, such as a
          // pinned list that isn't the active list.
          queryClient.invalidateQueries({ queryKey: ['todos', listId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['list_meta', listId], refetchType: 'all' });
        }
        if (outcomesByList.size > 0) {
          queryClient.invalidateQueries({ queryKey: ['lists'] });
        }
      }

      clearHandledWidgetOps(CurrentListWidget, handled);
      clearHandledWidgetOps(PinnedListWidget, handled);

      // Widget checkoffs skip the in-app calendar code, so apply them to the device
      // calendar here (also runs from the background task, without a query cache).
      const appliedTodos = outcomes.flatMap((o) =>
        o.status === 'applied' && o.todo ? [o.todo] : []
      );
      if (appliedTodos.length > 0) {
        await reconcileTasksWithNativeCalendar(
          appliedTodos,
          queryClient ? (listId) => getCachedListName(queryClient, listId) : undefined
        ).catch(() => 0);
      }
    } while (drainRequestedWhileBusy);
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

    writeListWidgetSnapshot(CurrentListWidget, buildListWidgetSnapshot(meta, todos));

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

    writeListWidgetSnapshot(
      PinnedListWidget,
      pinnedConfig?.mode === 'reminders'
        ? buildUpNextWidgetSnapshot(meta, todos)
        : buildListWidgetSnapshot(meta, todos)
    );
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
