import type { QueryClient } from "@tanstack/react-query";
import type { TodoList } from "../shared";

type ListCacheReader = Pick<QueryClient, "getQueryData" | "getQueriesData">;

/**
 * Look up a list's name from data the app has already fetched, without a network call.
 * Checks the single-list query first, then any cached "lists" query (all, mine, shared).
 */
export function getCachedListName(queryClient: ListCacheReader, listId: string | null | undefined): string | null {
  if (!listId) return null;
  const meta = queryClient.getQueryData<TodoList>(["list_meta", listId]);
  if (meta?.name?.trim()) return meta.name.trim();
  for (const [, lists] of queryClient.getQueriesData<TodoList[]>({ queryKey: ["lists"] })) {
    if (!Array.isArray(lists)) continue;
    const match = lists.find((l) => l.id === listId);
    if (match?.name?.trim()) return match.name.trim();
  }
  return null;
}
