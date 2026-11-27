import { useEffect, useRef } from "react";
import type { FetcherWithComponents } from "react-router";

export interface FetcherToastPayload {
  pendingApproval?: boolean;
  message?: string;
  error?: string;
}

/**
 * Surfaces fetcher errors (and optionally collaborator pending-approval notices)
 * once per settled response without triggering synchronous setState warnings in components.
 */
export function useFetcherToast<T extends FetcherToastPayload | undefined>(
  fetcher: FetcherWithComponents<T>,
  onToast: (message: string) => void,
  options?: { surfacePendingApproval?: boolean }
) {
  const surfacePendingApproval = options?.surfacePendingApproval ?? false;
  const onToastRef = useRef(onToast);
  const lastHandledDataRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    onToastRef.current = onToast;
  });

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (lastHandledDataRef.current === fetcher.data) return;
    lastHandledDataRef.current = fetcher.data;

    if (surfacePendingApproval && fetcher.data.pendingApproval && fetcher.data.message) {
      onToastRef.current(fetcher.data.message);
    } else if (fetcher.data.error) {
      onToastRef.current(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data, surfacePendingApproval]);
}
