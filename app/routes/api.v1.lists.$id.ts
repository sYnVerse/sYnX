import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { UpdateListSchema } from "../../shared";

export async function action({ request, params, context }: ActionFunctionArgs) {
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
    return Response.json({ error: "Only the list owner can perform this action" }, { status: 403 });
  }

  if (request.method === "PUT") {
    try {
      const body = await request.json();
      const parsed = v.parse(UpdateListSchema, body);

      const newName = parsed.name ?? listRow.name;
      const newCategory = parsed.category ?? listRow.category ?? "Checklist";

      await db
        .prepare("UPDATE lists SET name = ?, category = ? WHERE id = ?")
        .bind(newName, newCategory, listId)
        .run();

      const updated = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<any>();

      return Response.json({
        success: true,
        list: {
          id: updated.id,
          name: updated.name,
          ownerId: updated.owner_id,
          createdAt: Number(updated.created_at),
          shareMode: updated.share_mode || "private",
          category: updated.category || "Checklist",
          isOwner: true,
        },
      });
    } catch (err: any) {
      return Response.json({ error: err.message || "Invalid payload" }, { status: 400 });
    }
  }

  if (request.method === "DELETE") {
    await db.prepare("DELETE FROM lists WHERE id = ?").bind(listId).run();
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
