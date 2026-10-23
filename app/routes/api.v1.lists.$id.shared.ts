import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { removeSharedListAccess } from "../shared-lists.server";
import { ensureUserProfileSchema } from "../user-profile.server";

/**
 * DELETE /api/v1/lists/:id/shared — remove a list from the caller's "Shared with me" view.
 * Does not delete the list itself or change share mode.
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listId = params.id;
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }

  await ensureUserProfileSchema(db);
  await removeSharedListAccess(db, user.userId, listId);

  return Response.json({ success: true });
}
