import { AppState, Platform } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import { addUserInteractionListener } from 'expo-widgets';
import currentListWidget, { initialSnapshot as initialCurrentSnapshot } from '../widgets/CurrentListWidget';
import pinnedListWidget, { initialSnapshot as initialPinnedSnapshot } from '../widgets/PinnedListWidget';
import listProgressWidget, { initialProgressSnapshot } from '../widgets/ListProgressWidget';
import { getLastActiveListId, getPinnedWidgetConfig } from './widgetPreferences';
import {
  WIDGET_UNDO_WINDOW_MS,
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
  resolveTaskSortMode,
  type ListWidgetSnapshot,
  type TaskSortMode,
  type WidgetPendingOp,
  type WidgetReplayOutcome,
  type WidgetTaskItem,
  type TodoItem,
  type TodoList,
} from '../shared';
import { apiClient, secureSessionStore } from '../api/client';
import { reconcileTasksWithNativeCalendar } from './calendar';
import { getCachedListName } from './listNames';
import {
  getTaskSortPreferences,
  loadTaskSortPreferences,
  subscribeTaskSortPreferences,
} from './taskSortPreferences';

let isDrainingOps = false;
let drainRequestedWhileBusy = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let undoExpiryTimer: ReturnType<typeof setTimeout> | null = null;

type ListWidgetHandle = typeof currentListWidget;

export interface WidgetSyncOptions {
  /** Flush pending check-offs immediately instead of keeping them in place for the undo window. */
  flushPendingUndo?: boolean;
  /** Wall-clock override (ms), mainly for deterministic tests. */
  now?: number;
}

/**
 * Resets all widgets to the logged-out state (used on logout).
 */
export function resetWidgetsLoggedOut(): void {
  try {
    currentListWidget.updateSnapshot(toNativeWidgetProps(initialCurrentSnapshot));
    pinnedListWidget.updateSnapshot(toNativeWidgetProps(initialPinnedSnapshot));
    listProgressWidget.updateSnapshot(toNativeWidgetProps(initialProgressSnapshot));
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
 * are still waiting to be replayed or breaking row order during the undo window.
 */
function writeListWidgetSnapshot(
  widget: ListWidgetHandle,
  snapshot: ListWidgetSnapshot,
  options?: WidgetSyncOptions
): void {
  const prevSnap = readWidgetSnapshot(widget);
  const queued = extractPendingWidgetOps(prevSnap);
  const merged = mergePendingOpsIntoSnapshot(snapshot, queued, {
    previousSnapshot: prevSnap as Partial<ListWidgetSnapshot> | null,
    now: options?.now,
    undoWindowMs: options?.flushPendingUndo ? 0 : WIDGET_UNDO_WINDOW_MS,
  });
  widget.updateSnapshot(toNativeWidgetProps(merged));
}

function getLatestPendingCompletedAt(tasks: unknown): number | null {
  if (!Array.isArray(tasks)) return null;
  let latest: number | null = null;
  for (const item of tasks) {
    const pendingAt = (item as WidgetTaskItem | null | undefined)?.pendingCompletedAt;
    if (typeof pendingAt === 'number' && (latest === null || pendingAt > latest)) {
      latest = pendingAt;
    }
  }
  return latest;
}

function hasActivePendingWidgetTasks(): boolean {
  return (
    getLatestPendingCompletedAt(readWidgetSnapshot(currentListWidget)?.tasks) !== null ||
    getLatestPendingCompletedAt(readWidgetSnapshot(pinnedListWidget)?.tasks) !== null
  );
}

/**
 * Removes handled ops from a widget's queue. Re-reads the stored snapshot so
 * taps made while the replay was running are kept, and keeps checked rows in
 * place until the ~10-second undo window ends (or is flushed on app open).
 */
function clearHandledWidgetOps(
  widget: ListWidgetHandle,
  handled: WidgetPendingOp[],
  options?: WidgetSyncOptions
): void {
  if (!handled.length) return;
  const snap = readWidgetSnapshot(widget);
  if (!snap || !Array.isArray(snap.pendingOps) || snap.pendingOps.length === 0) return;

  const now = options?.now ?? Date.now();
  const remaining = removeHandledWidgetOps(extractPendingWidgetOps(snap), handled);
  const remainingTodoIds = new Set(remaining.map((o) => o.todoId));
  const handledCompletedIds = new Set(
    handled.filter((o) => o.completed).map((o) => o.todoId)
  );
  const latestPendingAt = getLatestPendingCompletedAt(snap.tasks);
  const shouldFlushRows =
    Boolean(options?.flushPendingUndo) ||
    (latestPendingAt !== null && latestPendingAt + WIDGET_UNDO_WINDOW_MS <= now);

  let nextTasks = snap.tasks;
  if (shouldFlushRows && Array.isArray(snap.tasks)) {
    nextTasks = snap.tasks.flatMap((rawTask: WidgetTaskItem) => {
      if (
        rawTask &&
        typeof rawTask.pendingCompletedAt === 'number' &&
        handledCompletedIds.has(rawTask.id) &&
        !remainingTodoIds.has(rawTask.id)
      ) {
        if (!rawTask.recurrence || rawTask.recurrence === 'none') {
          return [];
        }
        const restored = { ...rawTask, completed: false };
        delete restored.pendingCompletedAt;
        return [restored];
      }
      return [rawTask];
    });
  }

  widget.updateSnapshot(toNativeWidgetProps({ ...snap, tasks: nextTasks, pendingOps: remaining } as any));
}

/** Builds the API completion payload for a queued widget check-off op. */
export function buildWidgetReplayPayload(op: WidgetPendingOp): {
  completed: boolean;
  completedAt: number;
  source: 'widget';
  opId?: string;
} {
  return op.opId
    ? { completed: op.completed, completedAt: op.at, source: 'widget', opId: op.opId }
    : { completed: op.completed, completedAt: op.at, source: 'widget' };
}

/**
 * Sends one queued widget checkoff to the API. The API resolves the task's own
 * list from its ID, so this works for any list (active, pinned, or shared).
 */
async function replayWidgetOp(op: WidgetPendingOp): Promise<WidgetReplayOutcome> {
  try {
    const res = await apiClient.post(
      `/api/v1/todos/${op.todoId}/completed`,
      buildWidgetReplayPayload(op)
    );
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
export async function drainAndReplayPendingWidgetOps(
  queryClient?: QueryClient,
  options?: WidgetSyncOptions
): Promise<void> {
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
        ...extractPendingWidgetOps(readWidgetSnapshot(currentListWidget)),
        ...extractPendingWidgetOps(readWidgetSnapshot(pinnedListWidget)),
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
          for (const outcome of listOutcomes) {
            queryClient.invalidateQueries({
              queryKey: ['todo-completions', outcome.op.todoId],
              refetchType: 'all',
            });
          }
        }
        if (outcomesByList.size > 0) {
          queryClient.invalidateQueries({ queryKey: ['lists'] });
        }
      }

      clearHandledWidgetOps(currentListWidget, handled, options);
      clearHandledWidgetOps(pinnedListWidget, handled, options);

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
 * The sort a list uses in the app: its own override if set, otherwise the
 * app-wide setting (Reminder Time by default). Widgets use it so they show
 * tasks in the same order as the app.
 */
async function resolveWidgetSortMode(listId: string): Promise<TaskSortMode> {
  await loadTaskSortPreferences();
  const prefs = getTaskSortPreferences();
  return resolveTaskSortMode(prefs.appDefault, prefs.overrides[listId]);
}

/**
 * Syncs the active list to CurrentListWidget and ListProgressWidget snapshots.
 */
export async function syncActiveList(
  listId?: string | null,
  providedMeta?: TodoList,
  providedTodos?: TodoItem[],
  queryClient?: QueryClient,
  options?: WidgetSyncOptions
): Promise<void> {
  try {
    const targetId = listId || (await getLastActiveListId());
    if (!targetId) return;

    const meta = providedMeta || (await resolveListMeta(targetId, queryClient));
    if (!meta) return;

    const todos =
      providedTodos !== undefined ? providedTodos : await resolveListTodos(targetId, queryClient);

    const sortMode = await resolveWidgetSortMode(targetId);

    writeListWidgetSnapshot(
      currentListWidget,
      buildListWidgetSnapshot(meta, todos, { sortMode, now: options?.now }),
      options
    );

    const progressSnap = buildProgressWidgetSnapshot(meta, todos, { sortMode, now: options?.now });
    listProgressWidget.updateSnapshot(toNativeWidgetProps(progressSnap));
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
  queryClient?: QueryClient,
  options?: WidgetSyncOptions
): Promise<void> {
  try {
    if (listId === null) {
      pinnedListWidget.updateSnapshot(toNativeWidgetProps(initialPinnedSnapshot));
      return;
    }

    const pinnedConfig = await getPinnedWidgetConfig();
    const targetId = listId || pinnedConfig?.listId;
    if (!targetId) {
      pinnedListWidget.updateSnapshot(toNativeWidgetProps(initialPinnedSnapshot));
      return;
    }

    const meta = providedMeta || (await resolveListMeta(targetId, queryClient));
    if (!meta) return;

    const todos =
      providedTodos !== undefined ? providedTodos : await resolveListTodos(targetId, queryClient);

    // The Up Next view stays earliest reminder first; the list view follows the list's sort.
    writeListWidgetSnapshot(
      pinnedListWidget,
      pinnedConfig?.mode === 'reminders'
        ? buildUpNextWidgetSnapshot(meta, todos, { now: options?.now })
        : buildListWidgetSnapshot(meta, todos, {
            sortMode: await resolveWidgetSortMode(targetId),
            now: options?.now,
          }),
      options
    );
  } catch (e) {
    console.warn('[widgetSync] Error syncing pinned list widget:', e);
  }
}

/**
 * Syncs both active and pinned widgets immediately.
 */
export async function syncAllWidgets(
  queryClient?: QueryClient,
  options?: WidgetSyncOptions
): Promise<void> {
  try {
    const pinnedConfig = await getPinnedWidgetConfig();
    await Promise.allSettled([
      syncActiveList(undefined, undefined, undefined, queryClient, options),
      syncPinnedList(pinnedConfig?.listId ?? null, undefined, undefined, queryClient, options),
    ]);
  } catch (e) {
    console.warn('[widgetSync] Error syncing all widgets:', e);
  }
}

/**
 * Syncs the current React Query cached list and todo state into widget snapshots.
 */
export async function syncWidgetsFromCache(
  queryClient: QueryClient,
  options?: WidgetSyncOptions
): Promise<void> {
  await syncAllWidgets(queryClient, options);
}

/**
 * Starts the real-time widget synchronization service.
 * - Drains pending ops and pushes initial widget snapshots on launch
 * - Holds home-screen widget check-offs for the ~10-second undo window before draining, or flushes immediately when opening the app
 * - Observes React Query cache mutations to update widget snapshots without shifting pending rows
 * - Listens for AppState foreground transitions to replay pending ops and refresh widgets
 * - Re-syncs when the app-wide task sort or a list's sort override changes
 */
export function startWidgetSyncService(queryClient: QueryClient): () => void {
  const clearUndoExpiryTimer = () => {
    if (undoExpiryTimer) {
      clearTimeout(undoExpiryTimer);
      undoExpiryTimer = null;
    }
  };

  const flushAndSync = () => {
    clearUndoExpiryTimer();
    void drainAndReplayPendingWidgetOps(queryClient, { flushPendingUndo: true }).then(() =>
      syncAllWidgets(queryClient, { flushPendingUndo: true })
    );
  };

  // 1. Opening/launching the app ends any active widget undo window and drains immediately.
  flushAndSync();

  // 2. Listen for widget taps: hold home-screen check-offs for the ~10s undo window so
  //    Undo can cancel before hitting the server and rows don't jump mid-batch.
  let widgetInteractionSub: { remove: () => void } | null = null;
  try {
    widgetInteractionSub = addUserInteractionListener((event) => {
      if (AppState.currentState === 'active') {
        flushAndSync();
        return;
      }

      clearUndoExpiryTimer();
      if (
        typeof event?.target === 'string' &&
        event.target.startsWith('undo:') &&
        !hasActivePendingWidgetTasks()
      ) {
        flushAndSync();
        return;
      }

      undoExpiryTimer = setTimeout(() => {
        undoExpiryTimer = null;
        flushAndSync();
      }, WIDGET_UNDO_WINDOW_MS);
    });
  } catch (e) {
    console.warn('[widgetSync] Could not register user interaction listener:', e);
  }

  // 3. Listen for app foregrounding
  const appStateSub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      flushAndSync();
    }
  });

  // 4. Subscribe to React Query cache changes (debounced by 300ms)
  const scheduleSync = () => {
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }
    syncDebounceTimer = setTimeout(() => {
      void syncAllWidgets(queryClient);
    }, 300);
  };
  const queryCacheUnsub = queryClient.getQueryCache().subscribe((event) => {
    if (
      event?.type === 'updated' &&
      Array.isArray(event.query.queryKey) &&
      ['todos', 'list_meta', 'lists', 'active_list_todos_preview'].includes(String(event.query.queryKey[0]))
    ) {
      scheduleSync();
    }
  });

  // 5. Re-sync when the task sort changes in Settings or on a list, so widgets keep the app's order
  const taskSortUnsub = subscribeTaskSortPreferences(scheduleSync);

  return () => {
    widgetInteractionSub?.remove();
    appStateSub.remove();
    queryCacheUnsub();
    taskSortUnsub();
    clearUndoExpiryTimer();
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }
  };
}
