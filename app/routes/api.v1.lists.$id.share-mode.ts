import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { UpdateShareModeSchema } from "../../shared";
import { serializeListRow } from "../api-helpers.server";

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

  const listRow = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<any>();
  if (!listRow) {
    return Response.json({ error: "List not found" }, { status: 404 });
  }

  if (listRow.owner_id !== user.userId) {
    return Response.json({ error: "Only the list owner can update share mode" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = v.parse(UpdateShareModeSchema, body);

    await db.prepare("UPDATE lists SET share_mode = ? WHERE id = ?").bind(parsed.shareMode, listId).run();
    const updated = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<any>();
    const list = await serializeListRow(db, updated, { viewerUserId: user.userId });

    return Response.json({
      success: true,
      list,
    });
  } catch (err: any) {
    return Response.json({ error: err.message || "Invalid shareMode payload" }, { status: 400 });
  }
}
