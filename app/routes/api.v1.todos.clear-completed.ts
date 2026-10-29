import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { getListAccess } from "../api-helpers.server";
import {
  deleteRequestActivitySummary,
  logListActivity,
} from "../list-activity.server";
import { requestOrPerformDelete } from "../pending-deletes.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const listId = url.searchParams.get("listId");
  if (!listId) {
    return Response.json({ error: "listId query parameter is required" }, { status: 400 });
  }

  const access = await getListAccess(db, listId, user.userId);
  if (!access.canEdit) {
    return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
  }

  const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
  const result = await requestOrPerformDelete(db, {
    listId,
    userId: user.userId,
    isOwner: access.isOwner,
    canEdit: access.canEdit,
    targetType: "clear_completed",
    env,
    waitUntil,
  });

  if (result.kind === "deleted" || result.kind === "requested") {
    const logPromise = logListActivity(db, {
      listId,
      action: result.kind === "requested" ? "delete_requested" : "clear_completed",
      actorId: user.userId,
      isOwner: access.isOwner,
      shareMode: access.list?.share_mode,
      request,
      summary:
        result.kind === "requested"
          ? deleteRequestActivitySummary("clear_completed")
          : undefined,
    });
    if (waitUntil) waitUntil(logPromise); else await logPromise;
  }

  if (result.kind === "deleted") {
    return Response.json({ success: true });
  }
  if (result.kind === "requested") {
    return Response.json({
      success: true,
      pendingApproval: true,
      alreadyRequested: result.alreadyExisted,
      requestId: result.requestId,
      message: result.message,
    });
  }
  return Response.json({ error: result.error }, { status: 403 });
}
