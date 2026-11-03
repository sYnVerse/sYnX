import { sortSubtasks, sortTasks, type TaskSortMode } from "../../../../shared";
import type { Todo } from "~/to-do-manager";

export type Filter = "all" | "active" | "completed";

interface UseVisibleTodosOptions {
  todos: Todo[];
  filter: Filter;
  searchQuery: string;
  sortBy: TaskSortMode;
}

export function useVisibleTodos({
  todos,
  filter,
  searchQuery,
  sortBy,
}: UseVisibleTodosOptions) {
  const optimisticTodos: Todo[] = [...todos];

  // 1. Group all subtasks by parentId from optimisticTodos
  const allSubtasksByParent = optimisticTodos.reduce((acc, t) => {
    if (t.parentId) {
      if (!acc[t.parentId]) acc[t.parentId] = [];
      acc[t.parentId].push(t);
    }
    return acc;
  }, {} as Record<string, Todo[]>);

  // 2. Get all top-level parent tasks
  const allParents = optimisticTodos.filter((t) => !t.parentId);

  // 3. Filter parent tasks by status (All, Active, Completed) AND search query (matching parent text OR any subtask text)
  const filteredParents = allParents.filter((parent) => {
    if (filter === "active" && parent.completed) return false;
    if (filter === "completed" && !parent.completed) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const parentMatches = parent.text.toLowerCase().includes(q);
      const subtasks = allSubtasksByParent[parent.id] || [];
      const subtaskMatches = subtasks.some((sub) => sub.text.toLowerCase().includes(q));

      if (!parentMatches && !subtaskMatches) {
        return false;
      }
    }

    return true;
  });

  // 4. Sort visible parent tasks
  const visibleParents = sortTasks(filteredParents, sortBy);

  // 5. Group subtasks by parent (sorted chronologically)
  const subtasksMap: Record<string, Todo[]> = {};
  const searchQ = searchQuery.toLowerCase().trim();
  for (const parent of visibleParents) {
    const subs = allSubtasksByParent[parent.id] || [];
    const filteredSubs = searchQ
      ? subs.filter((sub) => sub.text.toLowerCase().includes(searchQ))
      : subs;
    subtasksMap[parent.id] = sortSubtasks(filteredSubs);
  }

  const totalCount = optimisticTodos.filter((t) => !t.parentId).length;
  const completedCount = optimisticTodos.filter((t) => !t.parentId && t.completed).length;
  const clearCompletedNeedsApproval = optimisticTodos.some(
    (t) => t.completed && !t.canDeleteDirectly
  );
  const activeCount = totalCount - completedCount;

  return {
    optimisticTodos,
    visibleParents,
    subtasksMap,
    totalCount,
    completedCount,
    activeCount,
    clearCompletedNeedsApproval,
  };
}
