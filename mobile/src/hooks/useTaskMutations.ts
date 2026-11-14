import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { TodoItem } from "../shared";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { syncTaskToNativeCalendar, removeTaskFromNativeCalendar } from "../services/calendar";
import { getCachedListName } from "../services/listNames";
import {
  getErrorMessage,
  triggerErrorHaptic,
  triggerImpactHaptic,
  triggerSuccessHaptic,
} from "../utils/feedback";
import {
  advanceTaskBaseline,
  findTodoInCache,
  formatRollbackError,
  patchTodosCache,
  restoreTodoInCache,
  useSlowPendingTracker,
  type TaskBaselineSnapshot,
} from "./useSetTodoCompleted";

type UpdateTaskVars = { id: string; payload: any };
type UpdateTaskContext = { seq: number };

/**
 * Create, update, delete and delete-request review for one list's tasks, with
 * optimistic single-task updates (sequence-guarded rollback, calendar restore,
 * and >10s slow pending tracking), cache updates, haptics, and toasts.
 */
export function useTaskMutations(listId: string) {
  const { hapticsEnabled } = useTheme();
  const { showError, showSuccess, showToast } = useToast();
  const queryClient = useQueryClient();
  const seqByIdRef = useRef<Map<string, number>>(new Map());
  const inFlightCountByIdRef = useRef<Map<string, number>>(new Map());
  const hadOverlapByIdRef = useRef<Map<string, boolean>>(new Map());
  const needsReconcileRef = useRef(false);
  const totalUpdateInFlightRef = useRef(0);
  const baselineByIdRef = useRef<Map<string, TaskBaselineSnapshot>>(new Map());
  const { slowPendingIds, isSlowPendingId, startSlowTimer, finishSlowTracking } =
    useSlowPendingTracker();

  const onMutationError = (error: unknown, fallback: string) => {
    triggerErrorHaptic(hapticsEnabled);
    showError(getErrorMessage(error, fallback));
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/api/v1/todos/${id}`);
      return {
        id,
        pendingApproval: Boolean(res.data?.pendingApproval),
        message: res.data?.message as string | undefined,
      };
    },
    onSuccess: (result) => {
      triggerImpactHaptic(hapticsEnabled);
      if (result.pendingApproval) {
        showToast(
          result.message || "Delete request sent. The list owner must approve it.",
          "info"
        );
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old
            ? old.map((t) => (t.id === result.id ? { ...t, pendingDelete: true } : t))
            : []
        );
        queryClient.invalidateQueries({ queryKey: ["todos", listId] });
        queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
        return;
      }
      if (result.id) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? old.filter((t) => t.id !== result.id && t.parentId !== result.id) : []
        );
        removeTaskFromNativeCalendar(result.id).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
      queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't delete task"),
  });

  const reviewDeleteMutation = useMutation({
    mutationFn: async ({
      requestId,
      decision,
    }: {
      requestId: string;
      decision: "approve" | "decline";
    }) => {
      const res = await apiClient.post(`/api/v1/delete-requests/${requestId}`, { decision });
      return res.data as { decision: string; listId?: string; targetType?: string };
    },
    onSuccess: (data) => {
      triggerSuccessHaptic(hapticsEnabled);
      showSuccess(data.decision === "approve" ? "Delete approved" : "Delete declined");
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
      queryClient.invalidateQueries({ queryKey: ["delete-requests", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      if (data.targetType === "list") {
        queryClient.invalidateQueries({ queryKey: ["list_meta", listId] });
      }
    },
    onError: (e) => onMutationError(e, "Couldn't update delete request"),
  });

  const createMutation = useMutation({
    mutationFn: async (newTodo: any) => {
      const res = await apiClient.post("/api/v1/todos", { ...newTodo, listId });
      return res.data.todo as TodoItem;
    },
    onSuccess: (createdTodo) => {
      triggerSuccessHaptic(hapticsEnabled);
      if (createdTodo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? [...old, createdTodo] : [createdTodo]
        );
        syncTaskToNativeCalendar(createdTodo, {
          listName: getCachedListName(queryClient, createdTodo.listId),
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't create task"),
  });

  const updateMutation = useMutation<TodoItem, unknown, UpdateTaskVars, UpdateTaskContext>({
    mutationFn: async ({ id, payload }: UpdateTaskVars) => {
      const res = await apiClient.put(`/api/v1/todos/${id}`, payload);
      return res.data.todo as TodoItem;
    },
    onMutate: async ({ id, payload }) => {
      const seq = (seqByIdRef.current.get(id) ?? 0) + 1;
      seqByIdRef.current.set(id, seq);
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
      totalUpdateInFlightRef.current += 1;
      startSlowTimer(id);

      const applyOptimistic = () => {
        if (!listId) return;
        const patchObj = (payload || {}) as Partial<TodoItem> & { reminderAt?: number | null };
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, id, (item) => ({
            ...item,
            ...patchObj,
            reminderAt:
              patchObj.reminderAt === null
                ? undefined
                : (patchObj.reminderAt ?? item.reminderAt),
          }))
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
    onSuccess: (updatedTodo, vars, context) => {
      if (updatedTodo) {
        advanceTaskBaseline(baselineByIdRef.current, vars.id, updatedTodo);
      }
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      triggerSuccessHaptic(hapticsEnabled);
      if (updatedTodo && listId) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, updatedTodo.id, (item) => ({
            ...item,
            ...updatedTodo,
            subtasks: item.subtasks ?? updatedTodo.subtasks,
          }))
        );
        syncTaskToNativeCalendar(updatedTodo, {
          listName: getCachedListName(queryClient, updatedTodo.listId),
        }).catch(() => {});
      }
      if (listId && totalUpdateInFlightRef.current <= 1) {
        queryClient.invalidateQueries({ queryKey: ["todos", listId] });
      }
    },
    onError: (error, vars, context) => {
      if (context?.seq !== seqByIdRef.current.get(vars.id)) return;
      const baseline = baselineByIdRef.current.get(vars.id);
      if (listId && baseline) {
        restoreTodoInCache(queryClient, listId, vars.id, baseline);
        if (baseline.itemSnapshot) {
          if (baseline.itemSnapshot.reminderAt) {
            syncTaskToNativeCalendar(baseline.itemSnapshot, {
              listName: getCachedListName(queryClient, baseline.itemSnapshot.listId),
            }).catch(() => {});
          } else {
            removeTaskFromNativeCalendar(vars.id).catch(() => {});
          }
        }
      }
      if (listId && hadOverlapByIdRef.current.get(vars.id)) {
        needsReconcileRef.current = true;
      }
      triggerErrorHaptic(hapticsEnabled);
      showError(formatRollbackError(error));
    },
    onSettled: (_data, _error, vars, context) => {
      totalUpdateInFlightRef.current = Math.max(0, totalUpdateInFlightRef.current - 1);
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
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    reviewDeleteMutation,
    slowPendingIds,
    isSlowPendingId,
  };
}
