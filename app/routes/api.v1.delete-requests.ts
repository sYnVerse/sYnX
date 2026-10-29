import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { getListAccess } from "../api-helpers.server";
import {
  listPendingDeletesForList,
  listPendingDeletesForOwner,
} from "../pending-deletes.server";

/**
 * GET /api/v1/delete-requests
 *   ?scope=owned          — pending requests on lists the caller owns (default)
 *   ?listId=<id>          — pending requests for one list the caller can access
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const listId = url.searchParams.get("listId");

  if (listId) {
    const access = await getListAccess(db, listId, user.userId);
    if (!access.hasAccess) {
      return Response.json({ error: "Access denied to list" }, { status: 403 });
    }
    const requests = await listPendingDeletesForList(db, listId);
    return Response.json({ success: true, requests });
  }

  const requests = await listPendingDeletesForOwner(db, user.userId);
  return Response.json({ success: true, requests });
}
