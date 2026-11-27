import { href } from "react-router";
import type { ListActionContext } from "./context";
import { redirect } from "./context";
import { categoryError, listNameError, normalizeOptionalCategory } from "@synx/shared/write-limits";
import { getListAccess } from "@synx/backend/services/api-helpers.server";
import {
  archiveListForUser,
  findFirstActiveOwnedListId,
  getArchivedListMap,
  unarchiveListForUser,
} from "@synx/backend/services/list-archives.server";
import { recordSharedListAccess, listSharedWithMe } from "@synx/backend/services/shared-lists.server";
import { requestOrPerformDelete } from "@synx/backend/services/pending-deletes.server";
import { deleteRequestActivitySummary } from "@synx/backend/services/list-activity.server";

export async function handleUpdateShareMode(ctx: ListActionContext) {
  const { formData, db, userId, scheduleActivityLog } = ctx;
  const listId = formData.get("listId") as string;
  const shareMode = formData.get("shareMode") as string;
  if (shareMode !== "private" && shareMode !== "public_read" && shareMode !== "public_edit") {
    return Response.json({ error: "Invalid share mode" }, { status: 400 });
  }
  const ownRow = await db
    .prepare("SELECT share_mode FROM lists WHERE id = ? AND owner_id = ?")
    .bind(listId, userId)
    .first<{ share_mode: string | null }>();
  if (!ownRow) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }
  const previousMode = ownRow.share_mode || "private";
  await db.prepare("UPDATE lists SET share_mode = ? WHERE id = ?").bind(shareMode, listId).run();
  scheduleActivityLog({
    listId,
    action: "list_settings_changed",
    actorId: userId,
    isOwner: true,
    // Log against the non-private side so private→shared still records.
    shareMode: shareMode === "private" ? previousMode : shareMode,
    summary: `Share mode: ${previousMode} → ${shareMode}`,
  });
  return { success: true };
}

export async function handleCreateList(ctx: ListActionContext) {
  const { formData, db, userId } = ctx;
  const listName = formData.get("listName");
  const rawCategory = formData.get("category");
  const category = normalizeOptionalCategory(rawCategory);
  if (typeof listName !== "string" || !listName.trim()) {
    return Response.json({ error: "Invalid list name" }, { status: 400 });
  }
  const nameError = listNameError(listName.trim()) || categoryError(category);
  if (nameError) return Response.json({ error: nameError }, { status: 400 });
  const newListId = crypto.randomUUID();
  try {
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl, category) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newListId, listName.trim(), userId, Date.now(), null, category)
      .run();
  } catch (e) {
    console.error("Failed to create list:", e);
  }
  return redirect(href("/:id", { id: newListId }));
}

export async function handleRenameList(ctx: ListActionContext) {
  const { formData, db, userId, scheduleActivityLog } = ctx;
  const listId = formData.get("listId") as string;
  const newName = formData.get("newName") as string;
  if (typeof newName !== "string" || !newName.trim()) {
    return Response.json({ error: "Invalid list name" }, { status: 400 });
  }
  const nameError = listNameError(newName.trim());
  if (nameError) return Response.json({ error: nameError }, { status: 400 });
  const ownRow = await db
    .prepare("SELECT name, share_mode FROM lists WHERE id = ? AND owner_id = ?")
    .bind(listId, userId)
    .first<{ name: string; share_mode: string | null }>();
  if (!ownRow) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }
  try {
    await db.prepare("UPDATE lists SET name = ? WHERE id = ?").bind(newName.trim(), listId).run();
    scheduleActivityLog({
      listId,
      action: "list_renamed",
      actorId: userId,
      isOwner: true,
      shareMode: ownRow.share_mode,
      summary: `${ownRow.name} → ${newName.trim()}`,
    });
  } catch (e) {
    console.error("Failed to rename list:", e);
  }
  return { success: true };
}

export async function handleUpdateListCategory(ctx: ListActionContext) {
  const { formData, db, userId, scheduleActivityLog } = ctx;
  const listId = formData.get("listId") as string;
  const rawCategory = formData.get("category");
  const category = normalizeOptionalCategory(rawCategory);
  const catError = categoryError(category);
  if (catError) return Response.json({ error: catError }, { status: 400 });
  const ownRow = await db
    .prepare("SELECT category, share_mode FROM lists WHERE id = ? AND owner_id = ?")
    .bind(listId, userId)
    .first<{ category: string | null; share_mode: string | null }>();
  if (!ownRow) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }
  try {
    await db.prepare("UPDATE lists SET category = ? WHERE id = ?").bind(category, listId).run();
    const oldCatDisplay = ownRow.category || "None";
    const newCatDisplay = category || "None";
    scheduleActivityLog({
      listId,
      action: "list_settings_changed",
      actorId: userId,
      isOwner: true,
      shareMode: ownRow.share_mode,
      summary: `Category: ${oldCatDisplay} → ${newCatDisplay}`,
    });
  } catch (e) {
    console.error("Failed to update list category:", e);
  }
  return { success: true };
}

export async function handleDeleteList(ctx: ListActionContext) {
  const { formData, db, userId, isLoggedIn, activeListId, env, waitUntil, scheduleActivityLog } = ctx;
  const listId = formData.get("listId") as string;
  const listAccess = await db
    .prepare("SELECT owner_id, share_mode, name FROM lists WHERE id = ?")
    .bind(listId)
    .first<{ owner_id: string; share_mode: string; name: string }>();
  if (!listAccess) {
    return Response.json({ error: "List not found" }, { status: 404 });
  }
  const ownsList = isLoggedIn && listAccess.owner_id === userId;
  const listIsCollaborative = listAccess.share_mode === "public_edit";
  if (!ownsList && !listIsCollaborative) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }

  const result = await requestOrPerformDelete(db, {
    listId,
    userId,
    isOwner: ownsList,
    canEdit: ownsList || listIsCollaborative,
    targetType: "list",
    env,
    waitUntil,
  });

  if (result.kind === "requested" || result.kind === "deleted") {
    scheduleActivityLog({
      listId,
      action: result.kind === "requested" ? "delete_requested" : "list_deleted",
      actorId: userId,
      isOwner: ownsList,
      shareMode: listAccess.share_mode,
      summary:
        result.kind === "requested"
          ? deleteRequestActivitySummary("list")
          : listAccess.name,
    });
  }

  if (result.kind === "requested") {
    return {
      success: true,
      pendingApproval: true,
      alreadyRequested: result.alreadyExisted,
      message: result.message,
    };
  }
  if (result.kind !== "deleted") {
    return Response.json({ error: result.error }, { status: 403 });
  }

  if (ownsList && activeListId === listId) {
    try {
      const nextOwnedId = await findFirstActiveOwnedListId(db, userId);
      if (nextOwnedId) {
        return redirect(href("/:id", { id: nextOwnedId }));
      }
      return redirect(href("/"));
    } catch (e) {
      console.error("Failed to find fallback list:", e);
      return redirect(href("/"));
    }
  }
  return { success: true };
}

export async function handleArchiveList(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId, activeListId, scheduleActivityLog } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const listId = ((formData.get("listId") as string) || activeListId || "").trim();
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }
  const access = await getListAccess(db, listId, userId);
  if (!access.hasAccess || !access.list) {
    return Response.json(
      { error: access.denial === "not_found" ? "List not found" : "Access denied to list" },
      { status: access.denial === "not_found" ? 404 : 403 },
    );
  }
  if (!access.isOwner) {
    await recordSharedListAccess(db, userId, listId, false);
  }
  const { archivedAt, alreadyArchived } = await archiveListForUser(db, userId, listId);
  if (!alreadyArchived) {
    scheduleActivityLog({
      listId,
      action: "list_archived",
      actorId: userId,
      isOwner: access.isOwner,
      shareMode: access.list.share_mode,
      summary: access.list.name,
    });
  }

  if (activeListId === listId) {
    const nextOwnedId = await findFirstActiveOwnedListId(db, userId, listId);
    if (nextOwnedId) {
      return redirect(href("/:id", { id: nextOwnedId }));
    }
    const sharedRows = await listSharedWithMe(db, userId);
    const archivedMap = await getArchivedListMap(
      db,
      userId,
      sharedRows.map((r) => r.id),
    );
    const nextShared = sharedRows.find((r) => r.id !== listId && !archivedMap.has(r.id));
    if (nextShared) {
      return redirect(href("/:id", { id: nextShared.id }));
    }
    return redirect(href("/"));
  }

  return Response.json({ success: true, archived: true, archivedAt });
}

export async function handleUnarchiveList(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId, activeListId, scheduleActivityLog } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const listId = ((formData.get("listId") as string) || activeListId || "").trim();
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }
  const access = await getListAccess(db, listId, userId);
  if (!access.hasAccess || !access.list) {
    return Response.json(
      { error: access.denial === "not_found" ? "List not found" : "Access denied to list" },
      { status: access.denial === "not_found" ? 404 : 403 },
    );
  }
  const removed = await unarchiveListForUser(db, userId, listId);
  if (removed) {
    scheduleActivityLog({
      listId,
      action: "list_unarchived",
      actorId: userId,
      isOwner: access.isOwner,
      shareMode: access.list.share_mode,
      summary: access.list.name,
    });
  }
  return Response.json({ success: true, archived: false, archivedAt: null });
}
