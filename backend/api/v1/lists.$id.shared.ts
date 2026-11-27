import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { removeSharedListAccess } from "../../services/shared-lists.server";

/**
 * DELETE /api/v1/lists/:id/shared — remove a list from the caller's "Shared with me" view.
 * Does not delete the list itself or change share mode.
 */
export async function action({  request, params, context  }: ApiRouteArgs<{ id: string }>) {
  if (request.method !== "DELETE") {
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

  await removeSharedListAccess(db, user.userId, listId);

  return Response.json({ success: true });
}
