import { useCallback, useEffect, useRef, useState } from "react";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, Platform } from "react-native";
import { apiClient } from "../api/client";
import {
  SubtaskCompletionAction,
  TodoItem,
  applySetCompletedLocal,
  applySetCompletedWithSubtasksLocal,
  formatRescheduledToast,
  formatSubtaskCompletionPrompt,
  getIncompleteSubtasks,
  isRecurring,
  shouldPromptSubtaskCompletion,
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

/**
 * Advances the stored baseline for `id` when a server response succeeds so a later
 * overlapping rollback cannot revert past confirmed server state.
 */
export function advanceTaskBaseline(
  baselineMap: Map<string, TaskBaselineSnapshot>,
  id: string,
  confirmedTodo: TodoItem
): void {
  const existing = baselineMap.get(id);
  if (!existing) return;
  const mergedItem: TodoItem = existing.itemSnapshot
    ? {
        ...existing.itemSnapshot,
        ...confirmedTodo,
        subtasks: existing.itemSnapshot.subtasks ?? confirmedTodo.subtasks,
      }
    : confirmedTodo;
  baselineMap.set(id, {
    itemSnapshot: mergedItem,
    listSnapshot: patchTodosCache(existing.listSnapshot, id, () => mergedItem),
  });
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

type SetCompletedVars = {
  id: string;
  completed: boolean;
  subtaskAction?: SubtaskCompletionAction;
};
type SetCompletedResult = {
  todo: TodoItem;
  rescheduled: boolean;
  updatedSubtasks?: TodoItem[];
};
type SetCompletedContext = { seq: number };

/**
 * Idempotent mark-done / undo with optimistic cache updates, per-task sequence
 * tracking (latest intended toggle wins, duplicate same-value requests suppressed),
 * rollback + native calendar restore + error toast on failure, slow (>10s)
 * pending tracking, subtask completion prompt when completing a parent with open
 * subtasks, and reschedule toast for recurring tasks.
 */
export function useSetTodoCompleted(listId: string | undefined) {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const { hapticsEnabled } = useTheme();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const seqByIdRef = useRef<Map<string, number>>(new Map());
  const inFlightDesiredByIdRef = useRef<Map<string, boolean>>(new Map());
  const inFlightCountByIdRef = useRef<Map<string, number>>(new Map());
  const hadOverlapByIdRef = useRef<Map<string, boolean>>(new Map());
  const needsReconcileRef = useRef(false);
  const baselineByIdRef = useRef<Map<string, TaskBaselineSnapshot>>(new Map());
  const { slowPendingIds, isSlowPendingId, startSlowTimer, finishSlowTracking } =
    useSlowPendingTracker();

  const mutation = useMutation<
    SetCompletedResult,
    unknown,
    SetCompletedVars,
    SetCompletedContext
  >({
    mutationFn: async ({ id, completed, subtaskAction }: SetCompletedVars) => {
      const body = subtaskAction ? { completed, subtaskAction } : { completed };
      const res = await apiClient.post(`/api/v1/todos/${id}/completed`, body);
      return res.data as SetCompletedResult;
    },
    onMutate: async ({ id, completed, subtaskAction }) => {
      const seq = (seqByIdRef.current.get(id) ?? 0) + 1;
      seqByIdRef.current.set(id, seq);
      inFlightDesiredByIdRef.current.set(id, completed);

      const prevCount = inFlightCountByIdRef.current.get(id) ?? 0;
      if (prevCount > 0) {
        hadOverlapByIdRef.current.set(id, true);
      }
      if (!baselineByIdRef.current.has(id) && listId) {
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
          subtaskAction
            ? applySetCompletedWithSubtasksLocal(old, id, completed, subtaskAction)
            : patchTodosCache(old, id, (item) => applySetCompletedLocal(item, completed).todo)
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
        if (vars.subtaskAction && baseline.listSnapshot) {
          // Restore the whole list so promoted or bulk-completed subtasks revert with the parent.
          queryClient.setQueryData<TodoItem[] | undefined>(
            ["todos", listId],
            baseline.listSnapshot
          );
        } else {
          restoreTodoInCache(queryClient, listId, vars.id, baseline);
        }
        if (baseline.itemSnapshot) {
          syncTaskToNativeCalendar(baseline.itemSnapshot, {
            listName: getCachedListName(queryClient, baseline.itemSnapshot.listId),
          }).catch(() => {});
        }
      }
      if (listId && hadOverlapByIdRef.current.get(vars.id)) {
        needsReconcileRef.current = true;
      }
      triggerErrorHaptic(hapticsEnabled);
      showError(formatRollbackError(error));
    },
    onSuccess: (data, vars, context) => {
      if (data?.todo) {
        advanceTaskBaseline(baselineByIdRef.current, vars.id, data.todo);
      }
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      if (hapticsEnabled && Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (listId && data?.todo) {
        const updatedSubtasks = data.updatedSubtasks ?? [];
        if (updatedSubtasks.length > 0 || vars.subtaskAction) {
          const subtaskMap = new Map(updatedSubtasks.map((st) => [st.id, st]));
          queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) => {
            if (!old) return old;
            return old.map((item) => {
              const updatedSub = subtaskMap.get(item.id);
              if (updatedSub) {
                return {
                  ...updatedSub,
                  subtasks: item.subtasks,
                };
              }
              if (item.id === data.todo.id) {
                return {
                  ...item,
                  ...data.todo,
                  subtasks: item.subtasks
                    ?.filter((s) => !(vars.subtaskAction === "promote" && subtaskMap.has(s.id)))
                    .map((s) => subtaskMap.get(s.id) ?? s),
                };
              }
              if (item.subtasks?.some((s) => s.id === data.todo.id || subtaskMap.has(s.id))) {
                return {
                  ...item,
                  subtasks: item.subtasks.map((s) => {
                    if (s.id === data.todo.id) return { ...s, ...data.todo };
                    return subtaskMap.get(s.id) ?? s;
                  }),
                };
              }
              return item;
            });
          });
        } else {
          queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
            patchTodosCache(old, data.todo.id, (item) => ({
              ...item,
              ...data.todo,
              subtasks: item.subtasks ?? data.todo.subtasks,
            }))
          );
        }
        const listName = getCachedListName(queryClient, data.todo.listId);
        syncTaskToNativeCalendar(data.todo, { listName }).catch(() => {});
        for (const st of updatedSubtasks) {
          syncTaskToNativeCalendar(st, { listName }).catch(() => {});
        }
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
        baselineByIdRef.current.delete(vars.id);
        hadOverlapByIdRef.current.delete(vars.id);
      } else {
        inFlightCountByIdRef.current.set(vars.id, nextCount);
      }

      if (needsReconcileRef.current && listId && inFlightCountByIdRef.current.size === 0) {
        needsReconcileRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["todos", listId] });
      }

      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;

      finishSlowTracking(vars.id);
      inFlightDesiredByIdRef.current.delete(vars.id);
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
      todo: Pick<TodoItem, "id" | "completed"> &
        Partial<Pick<TodoItem, "parentId" | "pendingDelete" | "recurrence" | "subtasks">>,
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

      const cachedTodos = listId
        ? queryClient.getQueryData<TodoItem[]>(["todos", listId])
        : undefined;

      if (shouldPromptSubtaskCompletion(todo, desired, cachedTodos)) {
        const incompleteCount = getIncompleteSubtasks(todo, cachedTodos).length;
        const prompt = formatSubtaskCompletionPrompt(incompleteCount);
        Alert.alert(
          prompt.title,
          prompt.message,
          [
            { text: prompt.cancelLabel, style: "cancel" },
            {
              text: prompt.promoteLabel,
              onPress: () => {
                if (inFlightDesiredByIdRef.current.get(todo.id) === true) return;
                inFlightDesiredByIdRef.current.set(todo.id, true);
                mutation.mutate({ id: todo.id, completed: true, subtaskAction: "promote" });
              },
            },
            {
              text: prompt.completeLabel,
              onPress: () => {
                if (inFlightDesiredByIdRef.current.get(todo.id) === true) return;
                inFlightDesiredByIdRef.current.set(todo.id, true);
                mutation.mutate({ id: todo.id, completed: true, subtaskAction: "complete" });
              },
            },
          ],
          { cancelable: true }
        );
        return;
      }

      inFlightDesiredByIdRef.current.set(todo.id, desired);
      mutation.mutate({ id: todo.id, completed: desired });
    },
    [listId, mutation, queryClient]
  );

  const isPendingId = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return { setCompleted, isPendingId, pendingIds, isSlowPendingId, slowPendingIds };
}
