/**
 * Helpers for moving a guest's browser-stored lists into their account.
 * Kept free of server-only imports so route code can use it.
 */

/** The id fields of a guest task, as read from untrusted local storage JSON. */
export type GuestTodoIds = { id?: unknown; parentId?: unknown };

/**
 * Gives every task in one guest list a fresh id and points each subtask at its
 * parent's new id. A parentId that doesn't match a task in the same list (or
 * isn't a string) becomes null, so a migrated subtask can never link to a task
 * in another list. Returns one entry per input task, in the same order.
 */
export function remapGuestTodoIds(
  todos: readonly GuestTodoIds[],
  newId: () => string = () => crypto.randomUUID(),
): Array<{ id: string; parentId: string | null }> {
  const idMap = new Map<string, string>();
  for (const todo of todos) {
    if (typeof todo.id === "string" && todo.id) {
      idMap.set(todo.id, newId());
    }
  }
  return todos.map((todo) => ({
    id: (typeof todo.id === "string" && idMap.get(todo.id)) || newId(),
    parentId: typeof todo.parentId === "string" ? (idMap.get(todo.parentId) ?? null) : null,
  }));
}
