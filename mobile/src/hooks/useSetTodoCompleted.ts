import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { apiClient } from "../api/client";
import {
  TodoItem,
  applySetCompletedLocal,
  formatRescheduledToast,
} from "../shared";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { syncTaskToNativeCalendar } from "../services/calendar";
import { getCachedListName } from "../services/listNames";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

type SetCompletedVars = { id: string; completed: boolean };
type SetCompletedResult = { todo: TodoItem; rescheduled: boolean };

function patchTodosCache(
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

/**
 * Idempotent mark-done / undo with optimistic cache updates, per-task in-flight
 * locking, rollback + error toast on failure, and reschedule toast for recurring tasks.
 */
export function useSetTodoCompleted(listId: string | undefined) {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const { hapticsEnabled } = useTheme();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const mutation = useMutation({
    mutationFn: async ({ id, completed }: SetCompletedVars) => {
      const res = await apiClient.post(`/api/v1/todos/${id}/completed`, { completed });
      return res.data as SetCompletedResult;
    },
    onMutate: async ({ id, completed }) => {
      setPendingIds((prev) => new Set(prev).add(id));
      if (!listId) return { previous: undefined as TodoItem[] | undefined };

      await queryClient.cancelQueries({ queryKey: ["todos", listId] });
      const previous = queryClient.getQueryData<TodoItem[]>(["todos", listId]);
      queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
        patchTodosCache(old, id, (item) => applySetCompletedLocal(item, completed).todo)
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (listId && context?.previous) {
        queryClient.setQueryData(["todos", listId], context.previous);
      }
      triggerErrorHaptic(hapticsEnabled);
      showError(getErrorMessage(error, "Couldn't update task"));
    },
    onSuccess: (data) => {
      if (hapticsEnabled && Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (listId && data.todo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          patchTodosCache(old, data.todo.id, (item) => ({
            ...item,
            ...data.todo,
            subtasks: item.subtasks,
          }))
        );
        syncTaskToNativeCalendar(data.todo, {
          listName: getCachedListName(queryClient, data.todo.listId),
        }).catch(() => {});
      }
      if (data.rescheduled && data.todo?.reminderAt) {
        showSuccess(formatRescheduledToast(data.todo.reminderAt));
      }
      // Intentionally skip invalidateQueries so a refetch cannot undo an in-flight sibling toggle.
    },
    onSettled: (_data, _error, vars) => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
    },
  });

  const setCompleted = useCallback(
    (todo: Pick<TodoItem, "id" | "completed">, completed?: boolean) => {
      if (pendingIds.has(todo.id)) return;
      const desired = completed ?? !todo.completed;
      mutation.mutate({ id: todo.id, completed: desired });
    },
    [mutation, pendingIds]
  );

  const isPendingId = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return { setCompleted, isPendingId, pendingIds };
}
