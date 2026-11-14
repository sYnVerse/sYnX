import { useCallback, useEffect, useRef, useState } from "react";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { apiClient } from "../api/client";
import {
  TodoItem,
  applySetCompletedLocal,
  formatRescheduledToast,
  isRecurring,
} from "../shared";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { syncTaskToNativeCalendar } from "../services/calendar";
import { getCachedListName } from "../services/listNames";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

export const SLOW_MUTATION_THRESHOLD_MS = 10_000;

export interface TaskBaselineSnapshot {
  listSnapshot: TodoItem[] | undefined;
  itemSnapshot: TodoItem | undefined;
}

export function formatRollbackError(
  error: unknown,
  fallback = "Couldn't save, change undone"
): string {
  const detail = getErrorMessage(error, "").trim();
  if (!detail || detail === fallback) return fallback;
  return `${fallback}: ${detail}`;
}

export function findTodoInCache(
  list: TodoItem[] | undefined,
  id: string
): TodoItem | undefined {
  if (!list) return undefined;
  for (const t of list) {
    if (t.id === id) return t;
    const nested = t.subtasks?.find((s) => s.id === id);
    if (nested) return nested;
  }
  return undefined;
}

export function patchTodosCache(
  old: TodoItem[] | undefined,
  id: string,
  patch: (item: TodoItem) => TodoItem
): TodoItem[] | undefined {
  if (!old) return old;
  return old.map((t) => {
    if (t.id === id) return patch(t);
    if (t.subtasks?.some((s) => s.id === id)) {
      return {
        ...t,
        subtasks: t.subtasks.map((s) => (s.id === id ? patch(s) : s)),
      };
    }
    return t;
  });
}

export function restoreTodoInCache(
  queryClient: QueryClient,
  listId: string,
  id: string,
  baseline: TaskBaselineSnapshot
): void {
  if (baseline.itemSnapshot) {
    const saved = baseline.itemSnapshot;
    queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
      old ? patchTodosCache(old, id, () => saved) : baseline.listSnapshot
    );
    return;
  }
  queryClient.setQueryData<TodoItem[] | undefined>(
    ["todos", listId],
    baseline.listSnapshot
  );
}

export function useSlowPendingTracker() {
  const [slowPendingIds, setSlowPendingIds] = useState<Set<string>>(() => new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearSlowTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const startSlowTimer = useCallback(
    (id: string) => {
      clearSlowTimer(id);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setSlowPendingIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }, SLOW_MUTATION_THRESHOLD_MS);
      timersRef.current.set(id, timer);
    },
    [clearSlowTimer]
  );

  const finishSlowTracking = useCallback(
    (id: string) => {
      clearSlowTimer(id);
      setSlowPendingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [clearSlowTimer]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const isSlowPendingId = useCallback(
    (id: string) => slowPendingIds.has(id),
    [slowPendingIds]
  );

  return { slowPendingIds, isSlowPendingId, startSlowTimer, finishSlowTracking };
}

type SetCompletedVars = { id: string; completed: boolean };
type SetCompletedResult = { todo: TodoItem; rescheduled: boolean };
type SetCompletedContext = { seq: number };

/**
 * Idempotent mark-done / undo with optimistic cache updates, per-task sequence
 * tracking (latest intended toggle wins, duplicate same-value requests suppressed),
 * rollback + native calendar restore + error toast on failure, slow (>10s)
 * pending tracking, and reschedule toast for recurring tasks.
 */
export function useSetTodoCompleted(listId: string | undefined) {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const { hapticsEnabled } = useTheme();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const seqByIdRef = useRef<Map<string, number>>(new Map());
  const inFlightDesiredByIdRef = useRef<Map<string, boolean>>(new Map());
  const inFlightCountByIdRef = useRef<Map<string, number>>(new Map());
  const baselineByIdRef = useRef<Map<string, TaskBaselineSnapshot>>(new Map());
  const { slowPendingIds, isSlowPendingId, startSlowTimer, finishSlowTracking } =
    useSlowPendingTracker();

  const mutation = useMutation<
    SetCompletedResult,
    unknown,
    SetCompletedVars,
    SetCompletedContext
  >({
    mutationFn: async ({ id, completed }: SetCompletedVars) => {
      const res = await apiClient.post(`/api/v1/todos/${id}/completed`, { completed });
      return res.data as SetCompletedResult;
    },
    onMutate: async ({ id, completed }) => {
      const seq = (seqByIdRef.current.get(id) ?? 0) + 1;
      seqByIdRef.current.set(id, seq);
      inFlightDesiredByIdRef.current.set(id, completed);

      const prevCount = inFlightCountByIdRef.current.get(id) ?? 0;
      if (prevCount === 0 && listId) {
        const listSnapshot = queryClient.getQueryData<TodoItem[]>(["todos", listId]);
        const itemSnapshot = findTodoInCache(listSnapshot, id);
        baselineByIdRef.current.set(id, { listSnapshot, itemSnapshot });
      }
      inFlightCountByIdRef.current.set(id, prevCount + 1);

      setPendingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      startSlowTimer(id);

      const applyOptimistic = () => {
        if (!listId) return;
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, id, (item) => applySetCompletedLocal(item, completed).todo)
        );
      };

      applyOptimistic();
      if (listId) {
        await queryClient.cancelQueries({ queryKey: ["todos", listId] });
        if (seqByIdRef.current.get(id) === seq) {
          applyOptimistic();
        }
      }
      return { seq };
    },
    onError: (error, vars, context) => {
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      const baseline = baselineByIdRef.current.get(vars.id);
      if (listId && baseline) {
        restoreTodoInCache(queryClient, listId, vars.id, baseline);
        if (baseline.itemSnapshot) {
          syncTaskToNativeCalendar(baseline.itemSnapshot, {
            listName: getCachedListName(queryClient, baseline.itemSnapshot.listId),
          }).catch(() => {});
        }
      }
      triggerErrorHaptic(hapticsEnabled);
      showError(formatRollbackError(error));
    },
    onSuccess: (data, vars, context) => {
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      if (hapticsEnabled && Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (listId && data?.todo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, data.todo.id, (item) => ({
            ...item,
            ...data.todo,
            subtasks: item.subtasks ?? data.todo.subtasks,
          }))
        );
        syncTaskToNativeCalendar(data.todo, {
          listName: getCachedListName(queryClient, data.todo.listId),
        }).catch(() => {});
      }
      if (data?.rescheduled && data.todo?.reminderAt) {
        showSuccess(formatRescheduledToast(data.todo.reminderAt));
      }
      // Intentionally skip invalidateQueries so a refetch cannot undo an in-flight sibling toggle.
    },
    onSettled: (_data, _error, vars, context) => {
      const nextCount = Math.max(0, (inFlightCountByIdRef.current.get(vars.id) ?? 1) - 1);
      if (nextCount === 0) {
        inFlightCountByIdRef.current.delete(vars.id);
      } else {
        inFlightCountByIdRef.current.set(vars.id, nextCount);
      }

      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;

      finishSlowTracking(vars.id);
      inFlightDesiredByIdRef.current.delete(vars.id);
      baselineByIdRef.current.delete(vars.id);
      setPendingIds((prev) => {
        if (!prev.has(vars.id)) return prev;
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
    },
  });

  const setCompleted = useCallback(
    (
      todo: Pick<TodoItem, "id" | "completed"> & { recurrence?: string | null },
      completed?: boolean
    ) => {
      const desired = completed ?? !todo.completed;
      const inFlightDesired = inFlightDesiredByIdRef.current.get(todo.id);
      if (inFlightDesired !== undefined && inFlightDesired === desired) {
        return;
      }
      if (
        inFlightDesired === undefined &&
        completed !== undefined &&
        !isRecurring(todo.recurrence) &&
        Boolean(todo.completed) === Boolean(desired)
      ) {
        return;
      }
      inFlightDesiredByIdRef.current.set(todo.id, desired);
      mutation.mutate({ id: todo.id, completed: desired });
    },
    [mutation]
  );

  const isPendingId = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return { setCompleted, isPendingId, pendingIds, isSlowPendingId, slowPendingIds };
}
