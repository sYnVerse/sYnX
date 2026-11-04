/**
 * How far along a list is, for the web header's progress ring and the mobile
 * progress widget. Every task counts once, subtasks included, so checking off
 * a subtask moves the ring. Both apps use this so their numbers can't drift.
 *
 * `percent` is a whole number from 0 to 100; an empty list is 0%.
 */
export function countTaskProgress(
  todos: readonly { completed: boolean }[] | null | undefined
): { done: number; total: number; percent: number } {
  const list = todos ?? [];
  const total = list.length;
  const done = list.filter((t) => t.completed).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}
