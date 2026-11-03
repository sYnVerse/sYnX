import type { ListActionContext } from "./context";
import { redirect } from "./context";
import { categoryError, listNameError } from "~/write-limits";
import { requestOrPerformDelete } from "~/pending-deletes.server";
import { deleteRequestActivitySummary } from "~/list-activity.server";

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
  const category = (formData.get("category") as string) || "Checklist";
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
  return redirect(`/${newListId}`);
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
  const category = formData.get("category") as string;
  if (!category) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }
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
    scheduleActivityLog({
      listId,
      action: "list_settings_changed",
      actorId: userId,
      isOwner: true,
      shareMode: ownRow.share_mode,
      summary: `Category: ${ownRow.category || "Checklist"} → ${category}`,
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
      const firstList = await db
        .prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
        .bind(userId)
        .first<{ id: string }>();
      if (firstList) {
        return redirect(`/${firstList.id}`);
      } else {
        return redirect("/");
      }
    } catch (e) {
      console.error("Failed to find fallback list:", e);
      return redirect("/");
    }
  }
  return { success: true };
}
