import { AppState, Platform } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import type { TodoItem } from "../shared";
import { apiClient, secureSessionStore } from "../api/client";
import {
  getListIdsWithSyncedEvents,
  isCalendarSyncEnabled,
  reconcileTasksWithNativeCalendar,
} from "./calendar";
import { getCachedListName } from "./listNames";

// Query keys that hold a list's tasks.
const TODO_QUERY_KEYS = ["todos", "active_list_todos_preview"];
// Don't refetch lists for the calendar more often than this when the app comes back.
const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 60 * 1000;

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let lastForegroundRefresh = 0;

/** Every task the app currently has cached, across all lists. */
export function collectCachedTasks(queryClient: Pick<QueryClient, "getQueriesData">): TodoItem[] {
  const byId = new Map<string, TodoItem>();
  for (const key of TODO_QUERY_KEYS) {
    for (const [, tasks] of queryClient.getQueriesData<TodoItem[]>({ queryKey: [key] })) {
      if (!Array.isArray(tasks)) continue;
      // The full list query ("todos") wins over the preview when both are cached.
      for (const task of tasks) {
        if (key === "todos" || !byId.has(task.id)) byId.set(task.id, task);
      }
    }
  }
  return [...byId.values()];
}

/**
 * Reconcile the device calendar against the cached tasks. Catches check-offs made on the
 * home screen widget, the web app, or another device once their list has been refreshed.
 */
export async function reconcileCalendarFromCache(queryClient: QueryClient): Promise<number> {
  return reconcileTasksWithNativeCalendar(collectCachedTasks(queryClient), (listId) =>
    getCachedListName(queryClient, listId)
  );
}

/**
 * Fetch the latest tasks for each list that has synced calendar events. The fetch updates
 * the query cache, which triggers a reconcile through the cache listener.
 */
export async function refreshListsWithSyncedEvents(queryClient: QueryClient): Promise<void> {
  if (!(await isCalendarSyncEnabled())) return;
  const token = await secureSessionStore.getAccessToken();
  if (!token) return;

  const listIds = await getListIdsWithSyncedEvents();
  await Promise.allSettled(
    listIds.map((listId) =>
      queryClient.fetchQuery({
        queryKey: ["todos", listId],
        queryFn: async () => {
          const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
          return res.data.todos as TodoItem[];
        },
        staleTime: 30 * 1000,
        retry: false,
      })
    )
  );
}

function scheduleReconcile(queryClient: QueryClient): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileCalendarFromCache(queryClient).catch(() => {});
  }, 500);
}

/**
 * Keeps the device calendar in sync with task changes made outside the app:
 * - whenever cached tasks change (refetch, widget replay, pull to refresh), and
 * - when the app returns to the foreground, after refreshing lists with synced events.
 */
export function startCalendarReconcileService(queryClient: QueryClient): () => void {
  if (Platform.OS === "web") return () => {};

  const runForegroundRefresh = () => {
    const now = Date.now();
    if (now - lastForegroundRefresh < FOREGROUND_REFRESH_MIN_INTERVAL_MS) {
      scheduleReconcile(queryClient);
      return;
    }
    lastForegroundRefresh = now;
    refreshListsWithSyncedEvents(queryClient)
      .catch(() => {})
      .finally(() => scheduleReconcile(queryClient));
  };

  runForegroundRefresh();

  const appStateSub = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") runForegroundRefresh();
  });

  const queryCacheUnsub = queryClient.getQueryCache().subscribe((event) => {
    if (
      event?.type === "updated" &&
      Array.isArray(event.query.queryKey) &&
      TODO_QUERY_KEYS.includes(String(event.query.queryKey[0]))
    ) {
      scheduleReconcile(queryClient);
    }
  });

  return () => {
    appStateSub.remove();
    queryCacheUnsub();
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }
  };
}
