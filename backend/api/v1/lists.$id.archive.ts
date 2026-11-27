import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { getListAccess } from "../../services/api-helpers.server";
import { archiveListForUser, unarchiveListForUser } from "../../services/list-archives.server";
import { recordSharedListAccess } from "../../services/shared-lists.server";
import { logListActivity } from "../../services/list-activity.server";

/**
 * POST /api/v1/lists/:id/archive — hides this list for the signed-in caller.
 * DELETE /api/v1/lists/:id/archive — restores this list for the signed-in caller.
 */
export async function action({ request, params, context }: ApiRouteArgs<{ id: string }>) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listId = params.id;
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }

  const access = await getListAccess(db, listId, user.userId);
  if (!access.hasAccess || !access.list) {
    if (access.denial === "not_found" || !access.list) {
      return Response.json({ error: "List not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ error: "Access denied to list", code: "PRIVATE_LIST" }, { status: 403 });
  }

  const cfCtx = getCloudflareContext(context).ctx;
  const waitUntil = cfCtx?.waitUntil?.bind(cfCtx);

  if (request.method === "POST") {
    if (!access.isOwner) {
      await recordSharedListAccess(db, user.userId, listId, false);
    }
    const { archivedAt, alreadyArchived } = await archiveListForUser(db, user.userId, listId);
    if (!alreadyArchived) {
      const logPromise = logListActivity(db, {
        listId,
        action: "list_archived",
        actorId: user.userId,
        isOwner: access.isOwner,
        shareMode: access.list.share_mode,
        request,
        summary: access.list.name,
      });
      if (waitUntil) waitUntil(logPromise);
      else await logPromise;
    }
    return Response.json({ success: true, archived: true, archivedAt });
  }

  const removed = await unarchiveListForUser(db, user.userId, listId);
  if (removed) {
    const logPromise = logListActivity(db, {
      listId,
      action: "list_unarchived",
      actorId: user.userId,
      isOwner: access.isOwner,
      shareMode: access.list.share_mode,
      request,
      summary: access.list.name,
    });
    if (waitUntil) waitUntil(logPromise);
    else await logPromise;
  }
  return Response.json({ success: true, archived: false, archivedAt: null });
}
