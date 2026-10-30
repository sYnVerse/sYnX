import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days cache persistence
      staleTime: 1000 * 60 * 5, // 5 minutes stale time
      retry: 2,
    },
  },
});

/**
 * AsyncStorage key for the persisted query cache. This is the persister's
 * default key; it is passed explicitly so sign-out cleanup removes the same
 * key. Changing it would orphan existing caches on users' devices.
 */
export const QUERY_CACHE_STORAGE_KEY = "REACT_QUERY_OFFLINE_CACHE";

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
});

/**
 * Clears both the in-memory TanStack Query cache and the persisted AsyncStorage
 * snapshot so signed-out user data is not retained on disk. Never throws, so
 * it can't block sign-out: failures are logged, and a failed persister cleanup
 * is retried by removing the storage key directly.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  queryClient.clear();
  try {
    await asyncStoragePersister.removeClient();
    return;
  } catch (e) {
    console.warn("[storage] Failed to clear the persisted query cache, removing its key directly:", e);
  }
  try {
    await AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch (e) {
    console.warn("[storage] Failed to remove the persisted query cache key:", e);
  }
}
