import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from "react";
import { useFetcher } from "react-router";

export const ROLLBACK_ERROR_MESSAGE = "Couldn't save, change undone";
export const SLOW_PENDING_THRESHOLD_MS = 10_000;

export interface OptimisticActionData {
  success?: boolean;
  error?: string;
}

export function formatSaveError(detail?: string | null): string {
  const trimmed = detail?.trim();
  if (!trimmed || trimmed === ROLLBACK_ERROR_MESSAGE) {
    return ROLLBACK_ERROR_MESSAGE;
  }
  return `${ROLLBACK_ERROR_MESSAGE}: ${trimmed}`;
}

export interface UseOptimisticFieldOptions<TValue, TData extends OptimisticActionData> {
  /** Authoritative server value from loader props. */
  serverValue: TValue;
  /** Unique fetcher key scoped to task+field so newer writes supersede stale ones. */
  fetcherKey: string;
  /** Invoked when a write fails or returns an error so the revert is never silent. */
  onError?: (message: string) => void;
  /** Invoked once when an in-flight write settles cleanly with `{ success: true }`. */
  onSuccess?: (data: TData) => void;
  /** Override slow-pending threshold (ms) for tests; defaults to 10s. */
  slowPendingMs?: number;
}

/**
 * Coordinates React 19 `useOptimistic` + `startTransition` with a keyed React Router
 * `useFetcher`, tracking in-flight submission generations so settlement effects never
 * miss fast or transition-batched `submitting -> idle` updates.
 */
export function useOptimisticField<TValue, TData extends OptimisticActionData = OptimisticActionData>({
  serverValue,
  fetcherKey,
  onError,
  onSuccess,
  slowPendingMs = SLOW_PENDING_THRESHOLD_MS,
}: UseOptimisticFieldOptions<TValue, TData>) {
  const fetcher = useFetcher<TData>({ key: fetcherKey });
  const [optimisticValue, addOptimistic] = useOptimistic<TValue, TValue>(
    serverValue,
    (_current, next) => next
  );

  const [submitGen, setSubmitGen] = useState(0);
  const [settledGen, setSettledGen] = useState(0);
  const [slowGen, setSlowGen] = useState<number | null>(null);

  const latestSeqRef = useRef(0);
  const handledSeqRef = useRef(0);
  const activeSeqRef = useRef<number | null>(null);
  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onErrorRef.current = onError;
    onSuccessRef.current = onSuccess;
  });

  const isPending = fetcher.state !== "idle";

  useEffect(() => {
    if (!isPending) return;
    const currentGen = submitGen;
    const timer = setTimeout(() => {
      setSlowGen(currentGen);
    }, slowPendingMs);
    return () => clearTimeout(timer);
  }, [isPending, submitGen, slowPendingMs]);

  useEffect(() => {
    if (isPending || activeSeqRef.current !== null) return;
    if (handledSeqRef.current >= latestSeqRef.current) return;
    handledSeqRef.current = latestSeqRef.current;

    const data = fetcher.data as TData | undefined;
    if (data?.error) {
      onErrorRef.current?.(formatSaveError(data.error));
    } else if (!data || data.success !== true) {
      onErrorRef.current?.(ROLLBACK_ERROR_MESSAGE);
    } else {
      onSuccessRef.current?.(data);
    }
  }, [isPending, fetcher.data, submitGen, settledGen]);

  const submit = useCallback(
    (nextValue: TValue, formPayload: Record<string, string>): Promise<void> => {
      const seq = ++latestSeqRef.current;
      activeSeqRef.current = seq;
      setSubmitGen((g) => g + 1);

      const submitPromise = Promise.resolve(
        fetcher.submit(formPayload, { method: "post" })
      );

      return new Promise<void>((resolve) => {
        startTransition(async () => {
          addOptimistic(nextValue);
          try {
            await submitPromise;
          } catch {
            // Rejected submits are surfaced once fetcher settles back to idle.
          } finally {
            if (activeSeqRef.current === seq) {
              activeSeqRef.current = null;
            }
            setSettledGen((g) => g + 1);
            resolve();
          }
        });
      });
    },
    [addOptimistic, fetcher]
  );

  const isSlowPending = isPending && slowGen === submitGen;

  return {
    value: optimisticValue,
    isPending,
    isSlowPending,
    submit,
    fetcher,
  };
}
