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
}

/**
 * Pure UI helper: turn share-mode + ownership into a consistent permission banner.
 * Server-side enforcement remains authoritative; this only drives presentation.
 */
export function getListPermissionPresentation(
  input: ListPermissionInput
): ListPermissionPresentation {
  const { shareMode, isOwner, canEdit } = input;

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
        : "You are viewing a shared list. Editing is disabled.",
      tone: "view_only",
      icon: "eye",
    };
  }

  // public_edit (or owner with edit access on a collaborative list)
  return {
    label: "Collaborative",
    description: isOwner
      ? "Anyone with the link can view and edit this list."
      : "You're editing a shared collaborative list.",
    tone: "collaborative",
    icon: "users",
  };
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
