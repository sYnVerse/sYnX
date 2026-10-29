import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import {
  approvePendingDelete,
  declinePendingDelete,
} from "../pending-deletes.server";

/**
 * POST /api/v1/delete-requests/:id
 * Body: { decision: "approve" | "decline" }
 * Owner only. Approve performs the delete; decline clears the request.
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = params.id;
  if (!requestId) {
    return Response.json({ error: "Request ID is required" }, { status: 400 });
  }

  let decision: string | undefined;
  try {
    const body = (await request.json()) as { decision?: string };
    decision = body.decision;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (decision !== "approve" && decision !== "decline") {
    return Response.json(
      { error: "decision must be \"approve\" or \"decline\"" },
      { status: 400 }
    );
  }

  if (decision === "approve") {
    const result = await approvePendingDelete(db, requestId, user.userId);
    if (result.kind === "not_found") {
      return Response.json({ error: result.error }, { status: 404 });
    }
    if (result.kind === "forbidden") {
      return Response.json({ error: result.error }, { status: 403 });
    }
    return Response.json({
      success: true,
      decision: "approve",
      listId: result.listId,
      targetType: result.targetType,
    });
  }

  const result = await declinePendingDelete(db, requestId, user.userId);
  if (result.kind === "not_found") {
    return Response.json({ error: result.error }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return Response.json({ error: result.error }, { status: 403 });
  }
  return Response.json({
    success: true,
    decision: "decline",
    listId: result.listId,
  });
}
