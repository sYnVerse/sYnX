import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { UpdateListSchema } from "../../shared";
import { getListAccess } from "../api-helpers.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  const listId = params.id;
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }

  const userId = user ? user.userId : "";
  const access = await getListAccess(db, listId, userId);
  if (!access.hasAccess || !access.list) {
    if (access.denial === "not_found" || !access.list) {
      return Response.json(
        { error: "List not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    return Response.json(
      {
        error: "This list is private",
        code: "PRIVATE_LIST",
        // Hint for signed-out / wrong-account UX on clients
        requiresAuth: !user,
      },
      { status: 403 }
    );
  }

  return Response.json({
    success: true,
    list: {
      id: access.list.id,
      name: access.list.name,
      ownerId: access.list.owner_id,
      createdAt: Number(access.list.created_at),
      shareMode: access.list.share_mode || "private",
      category: access.list.category || "Checklist",
      isOwner: access.isOwner,
      canEdit: access.canEdit,
    },
  });
}

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
