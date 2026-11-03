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

/**
 * Create, update, delete and delete-request review for one list's tasks, with
 * cache updates, native calendar sync, haptics and toasts.
 */
export function useTaskMutations(listId: string) {
  const { hapticsEnabled } = useTheme();
  const { showError, showSuccess, showToast } = useToast();
  const queryClient = useQueryClient();

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

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiClient.put(`/api/v1/todos/${id}`, payload);
      return res.data.todo as TodoItem;
    },
    onSuccess: (updatedTodo) => {
      triggerSuccessHaptic(hapticsEnabled);
      if (updatedTodo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? old.map((t) => (t.id === updatedTodo.id ? updatedTodo : t)) : []
        );
        syncTaskToNativeCalendar(updatedTodo, {
          listName: getCachedListName(queryClient, updatedTodo.listId),
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't update task"),
  });

  return { createMutation, updateMutation, deleteMutation, reviewDeleteMutation };
}
