/** Mirrors ShareMode in index.ts — kept local to avoid circular imports. */
type ShareMode = "private" | "public_read" | "public_edit";

/** Machine-readable denial codes from GET /api/v1/lists/:id */
export type ListAccessDenialCode = "NOT_FOUND" | "PRIVATE_LIST" | "ACCESS_DENIED";

export type ListPermissionTone = "private" | "view_only" | "collaborative";

export interface ListPermissionPresentation {
  /** Short badge label, e.g. "View-Only" */
  label: string;
  /** One-line explanation shown in the banner */
  description: string;
  tone: ListPermissionTone;
  /** Icon key for clients (lock | eye | users) */
  icon: "lock" | "eye" | "users";
}

export interface ListPermissionInput {
  shareMode: ShareMode;
  isOwner: boolean;
  canEdit: boolean;
  /** Owner's display name for non-owner copy (never email). */
  ownerDisplayName?: string | null;
}

/**
 * Pure UI helper: turn share-mode + ownership into a consistent permission banner.
 * Server-side enforcement remains authoritative; this only drives presentation.
 */
export function getListPermissionPresentation(
  input: ListPermissionInput
): ListPermissionPresentation {
  const { shareMode, isOwner, canEdit, ownerDisplayName } = input;
  const ownerLabel = ownerDisplayName?.trim() || null;

  if (shareMode === "private") {
    return {
      label: "Private",
      description: isOwner
        ? "Only you can view and edit this list."
        : "This list is private.",
      tone: "private",
      icon: "lock",
    };
  }

  if (shareMode === "public_read" || !canEdit) {
    return {
      label: "View-Only",
      description: isOwner
        ? "Anyone with the link can view — they cannot edit."
        : ownerLabel
          ? `Shared by ${ownerLabel}. Editing is disabled.`
          : "You are viewing a shared list. Editing is disabled.",
      tone: "view_only",
      icon: "eye",
    };
  }

  // public_edit (or owner with edit access on a collaborative list)
  return {
    label: "Collaborative",
    description: isOwner
      ? "Anyone with the link can view; signed-in users can edit."
      : ownerLabel
        ? `Shared by ${ownerLabel}. You're editing a collaborative list.`
        : "You're editing a shared collaborative list.",
    tone: "collaborative",
    icon: "users",
  };
}

/**
 * Whether a user can edit a list with the given share mode.
 * On collaborative lists (public_edit), editors must be signed in.
 */
export function canEditList(shareMode: ShareMode, isOwner: boolean, isLoggedIn: boolean): boolean {
  if (isOwner) return true;
  if (shareMode === "public_edit") return isLoggedIn;
  return false;
}

/** Human labels matching web + mobile share-mode pickers */
export function getShareModeLabel(mode: ShareMode): string {
  switch (mode) {
    case "private":
      return "Private";
    case "public_read":
      return "View-Only";
    case "public_edit":
      return "Collaborative";
  }
}

/** True when a list goes from Private to View-Only or Collaborative. */
export function isMakingListPublic(from: ShareMode, to: ShareMode): boolean {
  return from === "private" && to !== "private";
}

/**
 * Short owner-facing notice: shared lists show the owner's display name to
 * anyone with the link (guests included). Quotes the name when known.
 * Never mentions or exposes email.
 */
export function getSharedNameNotice(
  shareMode: ShareMode,
  ownerDisplayName?: string | null
): string {
  const name = ownerDisplayName?.trim();
  const yourName = name ? `your display name, "${name}",` : "your display name";
  if (shareMode === "private") {
    return `Sharing this list shows ${yourName} to anyone with the link.`;
  }
  return name
    ? `Anyone with the link can see your display name, "${name}".`
    : "Anyone with the link can see your display name.";
}

/** Minimal task shape for deciding who added a task and its subtasks. */
export interface TaskCreatorInfo {
  id: string;
  parentId?: string | null;
  /** Signed-in user who added the task; null/undefined for tasks added before this was recorded. */
  createdBy?: string | null;
}

/**
 * True when `userId` added the task and every subtask under it. Tasks with no
 * recorded creator count as added by someone else. Deleting a parent also
 * deletes its subtasks, so one subtask added by someone else is enough to
 * make the whole delete need the owner's approval.
 */
export function isOwnTaskTree(
  tasks: readonly TaskCreatorInfo[],
  taskId: string,
  userId: string | null | undefined
): boolean {
  if (!userId) return false;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const root = byId.get(taskId);
  if (!root || root.createdBy !== userId) return false;

  const childrenByParent = new Map<string, TaskCreatorInfo[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const siblings = childrenByParent.get(t.parentId);
    if (siblings) siblings.push(t);
    else childrenByParent.set(t.parentId, [t]);
  }

  const seen = new Set<string>([taskId]);
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of childrenByParent.get(current) || []) {
      if (seen.has(child.id)) continue;
      if (child.createdBy !== userId) return false;
      seen.add(child.id);
      queue.push(child.id);
    }
  }
  return true;
}

/**
 * Whether a delete of this task happens right away (true) or becomes a
 * delete request the list owner must approve (false). The owner always
 * deletes directly; a collaborator does only for tasks they added themselves
 * (including every subtask). People who can't edit can't delete at all, so
 * this is false for them too. Server-side checks stay authoritative.
 */
export function canDeleteTaskDirectly(input: {
  tasks: readonly TaskCreatorInfo[];
  taskId: string;
  userId: string | null | undefined;
  isOwner: boolean;
  canEdit: boolean;
}): boolean {
  if (input.isOwner) return true;
  if (!input.canEdit) return false;
  return isOwnTaskTree(input.tasks, input.taskId, input.userId);
}
