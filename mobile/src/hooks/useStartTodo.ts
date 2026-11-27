import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { apiClient } from "../api/client";
import { applyStartTodoLocal, type TodoItem } from "../shared";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { triggerErrorHaptic } from "../utils/feedback";
import {
  advanceTaskBaseline,
  findTodoInCache,
  formatRollbackError,
  getTaskCompletionEpoch,
  patchTodosCache,
  restoreTodoInCache,
  useSlowPendingTracker,
  type TaskBaselineSnapshot,
} from "./useSetTodoCompleted";

type StartTodoVars =
  | { id: string; action: "start"; startedAt: number }
  | { id: string; action: "cancel" };

type StartTodoResult = {
  success: boolean;
  todo: TodoItem;
};

type StartTodoContext = { seq: number; completionEpoch: number };

/**
 * Starts or cancels a task timer with optimistic cache updates, per-task sequence
 * tracking, rollback + error toast on failure, and slow-pending indicators.
 */
export function useStartTodo(listId: string | undefined) {
  const queryClient = useQueryClient();
  const { showError } = useToast();
  const { hapticsEnabled } = useTheme();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const seqByIdRef = useRef<Map<string, number>>(new Map());
  const inFlightCountByIdRef = useRef<Map<string, number>>(new Map());
  const needsReconcileRef = useRef(false);
  const baselineByIdRef = useRef<Map<string, TaskBaselineSnapshot>>(new Map());
  const { slowPendingIds, isSlowPendingId, startSlowTimer, finishSlowTracking } =
    useSlowPendingTracker();

  const mutation = useMutation<
    StartTodoResult,
    unknown,
    StartTodoVars,
    StartTodoContext
  >({
    mutationFn: async (vars: StartTodoVars) => {
      if (vars.action === "start") {
        const res = await apiClient.post(`/api/v1/todos/${vars.id}/start`, {
          startedAt: vars.startedAt,
        });
        return res.data as StartTodoResult;
      }
      const res = await apiClient.delete(`/api/v1/todos/${vars.id}/start`);
      return res.data as StartTodoResult;
    },
    onMutate: async (vars) => {
      const seq = (seqByIdRef.current.get(vars.id) ?? 0) + 1;
      seqByIdRef.current.set(vars.id, seq);
      const completionEpoch = getTaskCompletionEpoch(queryClient, listId, vars.id);

      const prevCount = inFlightCountByIdRef.current.get(vars.id) ?? 0;
      if (!baselineByIdRef.current.has(vars.id) && listId) {
        const listSnapshot = queryClient.getQueryData<TodoItem[]>(["todos", listId]);
        const itemSnapshot = findTodoInCache(listSnapshot, vars.id);
        baselineByIdRef.current.set(vars.id, { listSnapshot, itemSnapshot });
      }
      inFlightCountByIdRef.current.set(vars.id, prevCount + 1);

      setPendingIds((prev) => {
        if (prev.has(vars.id)) return prev;
        const next = new Set(prev);
        next.add(vars.id);
        return next;
      });
      startSlowTimer(vars.id);

      const startedAt = vars.action === "start" ? vars.startedAt : null;
      const applyOptimistic = () => {
        if (!listId) return;
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, vars.id, (item) => applyStartTodoLocal(item, startedAt))
        );
      };

      applyOptimistic();
      if (listId) {
        await queryClient.cancelQueries({ queryKey: ["todos", listId] });
        if (
          seqByIdRef.current.get(vars.id) === seq &&
          getTaskCompletionEpoch(queryClient, listId, vars.id) === completionEpoch
        ) {
          applyOptimistic();
        }
      }
      return { seq, completionEpoch };
    },
    onError: (error, vars, context) => {
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      if (context?.completionEpoch !== getTaskCompletionEpoch(queryClient, listId, vars.id)) {
        return;
      }
      const baseline = baselineByIdRef.current.get(vars.id);
      if (listId && baseline) {
        restoreTodoInCache(queryClient, listId, vars.id, baseline);
      }
      needsReconcileRef.current = true;
      triggerErrorHaptic(hapticsEnabled);
      showError(formatRollbackError(error));
    },
    onSuccess: (data, vars, context) => {
      if (context?.completionEpoch !== getTaskCompletionEpoch(queryClient, listId, vars.id)) {
        return;
      }
      if (data?.todo) {
        advanceTaskBaseline(baselineByIdRef.current, vars.id, data.todo);
      }
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      if (hapticsEnabled && Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      if (listId && data?.todo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, data.todo.id, (item) => ({
            ...item,
            ...data.todo,
            subtasks: item.subtasks ?? data.todo.subtasks,
          }))
        );
      }
    },
    onSettled: (_data, _error, vars, context) => {
      const nextCount = Math.max(0, (inFlightCountByIdRef.current.get(vars.id) ?? 1) - 1);
      if (nextCount === 0) {
        inFlightCountByIdRef.current.delete(vars.id);
        baselineByIdRef.current.delete(vars.id);
      } else {
        inFlightCountByIdRef.current.set(vars.id, nextCount);
      }

      if (needsReconcileRef.current && listId && inFlightCountByIdRef.current.size === 0) {
        needsReconcileRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["todos", listId] }).catch(() => {});
      }

      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      finishSlowTracking(vars.id);
      setPendingIds((prev) => {
        if (!prev.has(vars.id)) return prev;
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
    },
  });

  const startTodo = useCallback(
    (id: string, startedAt: number) => {
      mutation.mutate({ id, action: "start", startedAt });
    },
    [mutation]
  );

  const cancelStartTodo = useCallback(
    (id: string) => {
      mutation.mutate({ id, action: "cancel" });
    },
    [mutation]
  );

  const toggleStartTodo = useCallback(
    (todo: Pick<TodoItem, "id" | "startedAt">, startedAt: number) => {
      if (todo.startedAt != null) {
        mutation.mutate({ id: todo.id, action: "cancel" });
      } else {
        mutation.mutate({ id: todo.id, action: "start", startedAt });
      }
    },
    [mutation]
  );

  const isPendingId = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return {
    startTodo,
    cancelStartTodo,
    toggleStartTodo,
    isPendingId,
    pendingIds,
    isSlowPendingId,
    slowPendingIds,
  };
}
