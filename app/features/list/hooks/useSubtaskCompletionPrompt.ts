import { useCallback, useState } from "react";
import { useFetchers } from "react-router";
import type { GuestActionPayload } from "~/guest-context";
import type { CompletionSummary, Todo } from "~/to-do-manager";
import {
  applySetCompletedWithSubtasksLocal,
  getIncompleteSubtasks,
  shouldPromptSubtaskCompletion,
  type SubtaskCompletionAction,
} from "../../../../shared";
import { useOptimisticField } from "./useOptimisticField";

export interface SubtaskPromptState {
  todo: Todo;
  incompleteCount: number;
}

interface UseSubtaskCompletionPromptOptions {
  todos: Todo[];
  isLoggedIn: boolean;
  handleGuestAction: (intent: string, payload?: GuestActionPayload) => void;
  onNotify?: (message: string) => void;
  onTaskCompleted?: (payload: {
    todo: Todo;
    rescheduled: boolean;
    completion?: CompletionSummary | null;
  }) => void;
}

/**
 * Coordinates the parent/subtask completion prompt and optimistic list-level
 * rollback when completing a non-repeating top-level task with open subtasks.
 */
export function useSubtaskCompletionPrompt({
  todos,
  isLoggedIn,
  handleGuestAction,
  onNotify,
  onTaskCompleted,
}: UseSubtaskCompletionPromptOptions) {
  const [promptState, setPromptState] = useState<SubtaskPromptState | null>(null);
  const fetchers = useFetchers();

  const completionField = useOptimisticField<
    Todo[],
    {
      success?: boolean;
      todo?: Todo;
      updatedSubtasks?: Todo[];
      completion?: CompletionSummary | null;
      error?: string;
    }
  >({
    serverValue: todos,
    fetcherKey: "todo-subtask-completion",
    onError: onNotify,
    onSuccess: (data) => {
      if (data.todo?.completed) {
        onTaskCompleted?.({
          todo: data.todo,
          rescheduled: false,
          completion: data.completion ?? null,
        });
      }
    },
  });

  const optimisticTodos = completionField.value;

  const maybePromptForCompletion = useCallback(
    (todo: Todo, nextCompleted: boolean): boolean => {
      const deletingIds = new Set<string>();
      for (const f of fetchers) {
        if (f.state !== "idle" && f.formData?.get("intent") === "delete") {
          const id = f.formData.get("id");
          if (typeof id === "string" && id) deletingIds.add(id);
        }
      }
      const candidates =
        deletingIds.size > 0
          ? optimisticTodos.filter((item) => !deletingIds.has(item.id))
          : optimisticTodos;
      if (!shouldPromptSubtaskCompletion(todo, nextCompleted, candidates)) {
        return false;
      }
      const incompleteCount = getIncompleteSubtasks(todo, candidates).length;
      setPromptState({ todo, incompleteCount });
      return true;
    },
    [optimisticTodos, fetchers]
  );

  const confirmSubtaskCompletion = useCallback(
    (subtaskAction: SubtaskCompletionAction) => {
      if (!promptState) return;
      const target = promptState.todo;
      setPromptState(null);

      const nextTodos =
        applySetCompletedWithSubtasksLocal(optimisticTodos, target.id, true, subtaskAction) ??
        optimisticTodos;

      if (!isLoggedIn) {
        handleGuestAction("setCompleted", {
          id: target.id,
          completed: true,
          subtaskAction,
        });
      }

      void completionField.submit(nextTodos, {
        intent: "setCompleted",
        id: target.id,
        completed: "true",
        subtaskAction,
      });
    },
    [promptState, optimisticTodos, isLoggedIn, handleGuestAction, completionField]
  );

  const cancelSubtaskCompletion = useCallback(() => {
    setPromptState(null);
  }, []);

  return {
    optimisticTodos,
    promptState,
    isSlowPending: completionField.isSlowPending,
    maybePromptForCompletion,
    confirmSubtaskCompletion,
    cancelSubtaskCompletion,
  };
}
