import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { UpdateListSchema } from "../../shared";
import { getListAccess, serializeListRow } from "../api-helpers.server";
import { recordSharedListAccess } from "../shared-lists.server";
import { requestOrPerformDelete } from "../pending-deletes.server";
import { categoryError, listNameError } from "../write-limits";

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

  const access = await getListAccess(db, listId, user.userId);
  if (!access.list) {
    return Response.json({ error: "List not found" }, { status: 404 });
  }

  if (request.method === "PUT") {
    if (!access.isOwner) {
      return Response.json({ error: "Only the list owner can perform this action" }, { status: 403 });
    }
    try {
      const body = await request.json();
      const parsed = v.parse(UpdateListSchema, body);

      const newName = parsed.name ?? access.list.name;
      const newCategory = parsed.category ?? access.list.category ?? "Checklist";
      const limitError =
        (parsed.name !== undefined ? listNameError(parsed.name) : null) ||
        (parsed.category !== undefined ? categoryError(parsed.category) : null);
      if (limitError) {
        return Response.json({ error: limitError }, { status: 400 });
      }

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
    // Owner deletes immediately; collaborators on public_edit request approval.
    // View-only / private non-owners stay forbidden.
    if (!access.isOwner && !access.canEdit) {
      return Response.json({ error: "Only the list owner can perform this action" }, { status: 403 });
    }

    const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
    const result = await requestOrPerformDelete(db, {
      listId,
      userId: user.userId,
      isOwner: access.isOwner,
      canEdit: access.canEdit,
      targetType: "list",
      env,
      waitUntil,
    });

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

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
