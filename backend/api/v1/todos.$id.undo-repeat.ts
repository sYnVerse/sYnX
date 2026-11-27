import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { CompletionAttributionError, TodoManager } from "../../services/to-do-manager";
import { getListAccess } from "../../services/api-helpers.server";
import { logListActivity } from "../../services/list-activity.server";
import * as v from "valibot";
import { UndoRepeatSchema } from "@synx/shared";

/**
 * POST /api/v1/todos/:id/undo-repeat
 * Voids the latest (or specified) completion entry on a repeating task and restores
 * its previous reminder_at and reminder_sent flag so already-fired alerts do not resend.
 */
export async function action({ request, params, context }: ApiRouteArgs<{ id: string }>) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todoId = params.id;
  if (!todoId) {
    return Response.json({ error: "Todo ID is required" }, { status: 400 });
  }

  const todoRow = await db
    .prepare("SELECT list_id FROM todos WHERE id = ?")
    .bind(todoId)
    .first<{ list_id: string }>();
  if (!todoRow) {
    return Response.json({ error: "Todo not found" }, { status: 404 });
  }

  const access = await getListAccess(db, todoRow.list_id, user.userId);
  if (!access.canEdit) {
    return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
  }

  let completionId: string | undefined;
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      const body = JSON.parse(raw);
      const parsed = v.parse(UndoRepeatSchema, body);
      completionId = parsed.completionId;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json({ error: message || "Invalid payload" }, { status: 400 });
  }

  const manager = new TodoManager(db, todoRow.list_id);
  let todo: Awaited<ReturnType<TodoManager["undoRepeatCompletion"]>>["todo"];
  let undone = false;
  try {
    ({ todo, undone } = await manager.undoRepeatCompletion(todoId, {
      completionId,
      userId: user.userId,
      isOwner: access.isOwner,
    }));
  } catch (err) {
    if (err instanceof CompletionAttributionError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  if (undone) {
    const waitUntil = getCloudflareContext(context).ctx?.waitUntil?.bind(
      getCloudflareContext(context).ctx
    );
    const logPromise = logListActivity(db, {
      listId: todoRow.list_id,
      taskId: todoId,
      action: "task_uncompleted",
      actorId: user.userId,
      isOwner: access.isOwner,
      shareMode: access.list?.share_mode,
      request,
      summary: todo.text,
    });
    if (waitUntil) waitUntil(logPromise);
    else await logPromise;
  }

  return Response.json({ success: true, todo, undone });
}
