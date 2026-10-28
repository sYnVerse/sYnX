import { useCallback, useSyncExternalStore } from "react";

/**
 * Small localStorage-backed store for client-only UI state, read through
 * useSyncExternalStore so the server render and hydration use the fallback
 * and the stored value is applied right after hydration without an
 * effect-then-setState pass.
 *
 * Writes also land in an in-memory copy, so the UI still updates when
 * storage is unavailable (private mode, quota).
 */

const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed storage: drop our in-memory copy and re-read.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null) memory.clear();
    else memory.delete(e.key);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readStoredValue(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes (or with null, removes) a value and notifies subscribed components. */
export function writeStoredValue(key: string, value: string | null) {
  memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    console.error(`Failed to write ${key} to localStorage:`, e);
  }
  notify();
}

/**
 * The raw stored string for `key`. Null on the server, during hydration,
 * and when nothing is stored.
 */
export function useStoredValue(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readStoredValue(key),
    () => null
  );
  const setValue = useCallback((next: string | null) => writeStoredValue(key, next), [key]);
  return [value, setValue];
}

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true once rendering on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
