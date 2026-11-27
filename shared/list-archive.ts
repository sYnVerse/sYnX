export const ARCHIVE_PROMPT_DISMISSED_STORAGE_KEY =
  "synx_archive_prompt_dismissed_lists";

export interface ArchivableTaskLike {
  id?: string;
  completed?: boolean;
  subtasks?: readonly ArchivableTaskLike[];
}

export function countListTasks(
  todos: readonly ArchivableTaskLike[] | null | undefined,
): { total: number; open: number } {
  if (!todos || todos.length === 0) return { total: 0, open: 0 };
  let total = 0;
  let open = 0;
  const seenIds = new Set<string>();
  const seenRefs = new WeakSet<object>();

  const visit = (item: ArchivableTaskLike) => {
    if (!item || typeof item !== "object") return;
    if (seenRefs.has(item)) return;
    seenRefs.add(item);
    if (typeof item.id === "string" && item.id) {
      if (seenIds.has(item.id)) return;
      seenIds.add(item.id);
    }
    total += 1;
    if (!item.completed) open += 1;
    if (Array.isArray(item.subtasks)) {
      for (const sub of item.subtasks) visit(sub);
    }
  };

  for (const item of todos) visit(item);
  return { total, open };
}

/** True when the list has at least one task and every task and subtask is completed. */
export function isListCompleted(
  todos: readonly ArchivableTaskLike[] | null | undefined,
): boolean {
  const { total, open } = countListTasks(todos);
  return total > 0 && open === 0;
}

/** Checks summary fields on `TodoList` payloads without requiring the full task list. */
export function isListSummaryCompleted(
  summary:
    | {
        totalTaskCount?: number;
        openTaskCount?: number;
        openSubtaskCount?: number;
        allTasksCompleted?: boolean;
      }
    | null
    | undefined,
): boolean {
  if (!summary) return false;
  if (typeof summary.allTasksCompleted === "boolean") {
    return (
      summary.allTasksCompleted &&
      (summary.totalTaskCount === undefined || summary.totalTaskCount > 0)
    );
  }
  const total = summary.totalTaskCount ?? 0;
  const open = (summary.openTaskCount ?? 0) + (summary.openSubtaskCount ?? 0);
  return total > 0 && open === 0;
}

export function shouldSuggestArchivingList(input: {
  wasCompleted: boolean;
  isNowCompleted: boolean;
  isArchived: boolean;
  canArchive: boolean;
  suggestionsEnabled: boolean;
  dismissedForCycle: boolean;
}): boolean {
  return (
    !input.wasCompleted &&
    input.isNowCompleted &&
    !input.isArchived &&
    input.canArchive &&
    input.suggestionsEnabled &&
    !input.dismissedForCycle
  );
}

export function parseDismissedArchivePrompts(
  raw: string | null | undefined,
): Set<string> {
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  } catch {
    return new Set<string>();
  }
}

export function serializeDismissedArchivePrompts(ids: ReadonlySet<string>): string {
  return JSON.stringify(Array.from(ids));
}

export function markArchivePromptDismissed(
  current: ReadonlySet<string>,
  listId: string,
): Set<string> {
  const next = new Set(current);
  if (listId) next.add(listId);
  return next;
}

export function clearArchivePromptDismissed(
  current: ReadonlySet<string>,
  listId: string,
): Set<string> {
  if (!current.has(listId)) return new Set(current);
  const next = new Set(current);
  next.delete(listId);
  return next;
}
