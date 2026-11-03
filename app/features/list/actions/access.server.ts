import { guestIntentDenial } from "~/guest-access.server";

export interface ListAccessInfo {
  hasOwnership: boolean;
  isCollaborative: boolean;
  activeShareMode: string | null;
  listOwnerId: string | null;
}

export async function getActiveListAccess(
  db: D1Database,
  activeListId: string | undefined,
  userId: string,
  isLoggedIn: boolean
): Promise<ListAccessInfo> {
  let hasOwnership = false;
  let isCollaborative = false;
  let activeShareMode: string | null = null;
  let listOwnerId: string | null = null;

  if (activeListId) {
    try {
      const listRow = await db
        .prepare("SELECT owner_id, share_mode FROM lists WHERE id = ?")
        .bind(activeListId)
        .first<{ owner_id: string; share_mode: string | null }>();
      if (listRow) {
        listOwnerId = listRow.owner_id;
        // Guests never own D1 lists; their own lists live in localStorage.
        hasOwnership = isLoggedIn && listRow.owner_id === userId;
        isCollaborative = listRow.share_mode === "public_edit";
        activeShareMode = listRow.share_mode || "private";
      }
    } catch (e) {
      console.error("Failed to verify list access:", e);
    }
  }

  return { hasOwnership, isCollaborative, activeShareMode, listOwnerId };
}

export function checkListAccessGate(
  intent: string,
  isLoggedIn: boolean,
  access: ListAccessInfo
): Response | null {
  if (!isLoggedIn) {
    if (intent === "createList") {
      return Response.json({ error: guestIntentDenial("createList") }, { status: 403 });
    }
    // Guest lists (anything that isn't a shared D1 list) live in localStorage,
    // so there's nothing to write here.
    if (!access.listOwnerId && !access.isCollaborative) {
      return Response.json({ success: true, guestLocalStorage: true });
    }
    // Shared lists are view-only for guests, even in collaborative mode.
    return Response.json({ error: "Sign in to edit this list." }, { status: 403 });
  }

  // For non-list creation actions, verify ownership or collaborative access of the active list
  if (intent !== "createList" && !access.hasOwnership && !access.isCollaborative) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }

  return null;
}
