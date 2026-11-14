import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, Platform } from "react-native";
import { apiClient } from "../api/client";
import {
  SubtaskCompletionAction,
  TodoItem,
  applySetCompletedWithSubtasksLocal,
  formatRescheduledToast,
  formatSubtaskCompletionPrompt,
  getIncompleteSubtasks,
  shouldPromptSubtaskCompletion,
} from "../shared";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { syncTaskToNativeCalendar } from "../services/calendar";
import { getCachedListName } from "../services/listNames";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

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

/**
 * Idempotent mark-done / undo with optimistic cache updates, per-task in-flight
 * locking, rollback + error toast on failure, subtask completion prompt when
 * completing a parent with open subtasks, and reschedule toast for recurring tasks.
 */
export function useSetTodoCompleted(listId: string | undefined) {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const { hapticsEnabled } = useTheme();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const mutation = useMutation({
    mutationFn: async ({ id, completed, subtaskAction }: SetCompletedVars) => {
      const body = subtaskAction ? { completed, subtaskAction } : { completed };
      const res = await apiClient.post(`/api/v1/todos/${id}/completed`, body);
      return res.data as SetCompletedResult;
    },
    onMutate: async ({ id, completed, subtaskAction }) => {
      setPendingIds((prev) => new Set(prev).add(id));
      if (!listId) return { previous: undefined as TodoItem[] | undefined };

      await queryClient.cancelQueries({ queryKey: ["todos", listId] });
      const previous = queryClient.getQueryData<TodoItem[]>(["todos", listId]);
      queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
        applySetCompletedWithSubtasksLocal(old, id, completed, subtaskAction)
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
    onSuccess: (data, vars) => {
      if (hapticsEnabled && Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (listId && data.todo) {
        const updatedSubtasks = data.updatedSubtasks ?? [];
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
        const listName = getCachedListName(queryClient, data.todo.listId);
        syncTaskToNativeCalendar(data.todo, { listName }).catch(() => {});
        for (const st of updatedSubtasks) {
          syncTaskToNativeCalendar(st, { listName }).catch(() => {});
        }
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
    (
      todo: Pick<TodoItem, "id" | "completed"> &
        Partial<Pick<TodoItem, "parentId" | "pendingDelete" | "recurrence" | "subtasks">>,
      completed?: boolean
    ) => {
      if (pendingIds.has(todo.id)) return;
      const desired = completed ?? !todo.completed;
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
              onPress: () =>
                mutation.mutate({ id: todo.id, completed: true, subtaskAction: "promote" }),
            },
            {
              text: prompt.completeLabel,
              onPress: () =>
                mutation.mutate({ id: todo.id, completed: true, subtaskAction: "complete" }),
            },
          ],
          { cancelable: true }
        );
        return;
      }

      mutation.mutate({ id: todo.id, completed: desired });
    },
    [listId, mutation, pendingIds, queryClient]
  );

  const isPendingId = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return { setCompleted, isPendingId, pendingIds };
}
