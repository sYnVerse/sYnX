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

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

/**
 * Clears both the in-memory TanStack Query cache and the persisted AsyncStorage
 * snapshot so signed-out user data is not retained on disk.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  queryClient.clear();
  try {
    await asyncStoragePersister.removeClient();
  } catch {
    // Ignore storage cleanup errors on sign-out.
  }
}
