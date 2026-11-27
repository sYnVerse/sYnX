import * as v from "valibot";
import type { ApiRouteArgs } from "../types";
import { ReorderTodosSchema } from "@synx/shared";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { getListAccess } from "../../services/api-helpers.server";
import { TodoManager } from "../../services/to-do-manager";

export async function action({ request, context }: ApiRouteArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getCloudflareContext(context).env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = v.safeParse(ReorderTodosSchema, body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.issues[0]?.message || "Invalid reorder payload" },
      { status: 400 },
    );
  }

  const { listId, parentId, orderedIds } = parsed.output;
  const access = await getListAccess(db, listId, user.userId);
  if (!access.list) {
    return Response.json({ error: "List not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
  }

  const normalizedParentId = parentId ?? null;
  if (normalizedParentId) {
    const parentRow = await db
      .prepare("SELECT id FROM todos WHERE id = ? AND list_id = ?")
      .bind(normalizedParentId, listId)
      .first();
    if (!parentRow) {
      return Response.json({ error: "Parent task not found" }, { status: 400 });
    }
  }

  const todoManager = new TodoManager(
    db,
    listId,
    access.list.expiration_ttl ?? undefined,
  );
  try {
    const todos = await todoManager.reorder(orderedIds, normalizedParentId);
    return Response.json({ success: true, todos });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid reorder task IDs" },
      { status: 400 },
    );
  }
}
