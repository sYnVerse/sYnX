import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { UpdateShareModeSchema } from "../../shared";
import { serializeListRow, type ListRow } from "../api-helpers.server";
import { logListActivity } from "../list-activity.server";

export async function action({ request, params, context }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
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

  const listRow = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<ListRow>();
  if (!listRow) {
    return Response.json({ error: "List not found" }, { status: 404 });
  }

  if (listRow.owner_id !== user.userId) {
    return Response.json({ error: "Only the list owner can update share mode" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = v.parse(UpdateShareModeSchema, body);
    const previousShareMode = listRow.share_mode || "private";

    await db.prepare("UPDATE lists SET share_mode = ? WHERE id = ?").bind(parsed.shareMode, listId).run();
    const updated = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<ListRow>();
    if (!updated) {
      return Response.json({ error: "List not found" }, { status: 404 });
    }
    const list = await serializeListRow(db, updated, { viewerUserId: user.userId });

    // Prefer a non-private mode so the transition is recorded when leaving private,
    // and when entering private (activity would otherwise be skipped).
    const shareModeForLog =
      parsed.shareMode !== "private" ? parsed.shareMode : previousShareMode;
    const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
    const logPromise = logListActivity(db, {
      listId,
      action: "list_settings_changed",
      actorId: user.userId,
      isOwner: true,
      shareMode: shareModeForLog,
      request,
      summary: `Share mode: ${previousShareMode} → ${parsed.shareMode}`,
    });
    if (waitUntil) waitUntil(logPromise); else await logPromise;

    return Response.json({
      success: true,
      list,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json({ error: message || "Invalid shareMode payload" }, { status: 400 });
  }
}
