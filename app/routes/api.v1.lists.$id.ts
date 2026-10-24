import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { UpdateListSchema } from "../../shared";
import { getListAccess, serializeListRow } from "../api-helpers.server";
import { recordSharedListAccess } from "../shared-lists.server";
import { ensureUserProfileSchema } from "../user-profile.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  const listId = params.id;
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }

  await ensureUserProfileSchema(db);

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
        requiresAuth: !user,
      },
      { status: 403 }
    );
  }

  // Signed-in non-owners who can access → remember for "Shared with me"
  if (user && !access.isOwner) {
    await recordSharedListAccess(db, user.userId, listId, access.isOwner);
  }

  const list = await serializeListRow(db, access.list, {
    viewerUserId: userId,
    canEdit: access.canEdit,
  });

  return Response.json({
    success: true,
    list,
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

  await ensureUserProfileSchema(db);

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
      const list = await serializeListRow(db, updated, { viewerUserId: user.userId });

      return Response.json({
        success: true,
        list,
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
