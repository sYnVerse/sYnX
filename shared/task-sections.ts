/**
 * Splits tasks into the ones still to do and the completed ones, for mobile's
 * collapsible "Completed" section at the bottom of a list or subtask list.
 *
 * Each group keeps the order it was given in, so sort first with sortTasks
 * and both groups follow the list's sort. A task goes by its own
 * checkbox: a completed parent moves to the Completed group with all its
 * subtasks under it, even if some of them are still open. Returns new arrays
 * and never changes the input.
 */
export function splitCompletedTasks<T extends { completed: boolean }>(
  tasks: readonly T[]
): { active: T[]; completed: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  for (const task of tasks) {
    (task.completed ? completed : active).push(task);
  }
  return { active, completed };
}
