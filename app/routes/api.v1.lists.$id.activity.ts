import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import {
  LIST_ACTIVITY_DEFAULT_LIMIT,
  LIST_ACTIVITY_MAX_LIMIT,
  listActivityForOwner,
} from "../list-activity.server";

/**
 * GET /api/v1/lists/:id/activity?limit=&before=
 * Owner-only activity log for a shared list (newest first).
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
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

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || LIST_ACTIVITY_DEFAULT_LIMIT);
  const beforeRaw = url.searchParams.get("before");
  const limit = Number.isFinite(limitRaw) ? limitRaw : LIST_ACTIVITY_DEFAULT_LIMIT;
  const before =
    beforeRaw != null && beforeRaw !== "" && Number.isFinite(Number(beforeRaw))
      ? Number(beforeRaw)
      : null;

  const result = await listActivityForOwner(db, listId, user.userId, {
    limit: Math.min(Math.max(1, limit), LIST_ACTIVITY_MAX_LIMIT),
    before,
  });

  if (result.kind === "not_found") {
    return Response.json({ error: result.error }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return Response.json({ error: result.error }, { status: 403 });
  }

  return Response.json({
    success: true,
    listName: result.listName,
    entries: result.entries,
  });
}
