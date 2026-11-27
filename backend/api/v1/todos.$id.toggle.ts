import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { CompletionAttributionError, TodoManager } from "../../services/to-do-manager";
import { getListAccess } from "../../services/api-helpers.server";
import { logListActivity } from "../../services/list-activity.server";
import { getUserTimeZone } from "../../services/user-profile.server";

export async function action({  request, params, context  }: ApiRouteArgs<{ id: string }>) {
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
    .prepare("SELECT list_id, reminder_user_id FROM todos WHERE id = ?")
    .bind(todoId)
    .first<{ list_id: string; reminder_user_id: string | null }>();
  if (!todoRow) {
    return Response.json({ error: "Todo not found" }, { status: 404 });
  }

  const access = await getListAccess(db, todoRow.list_id, user.userId);
  if (!access.canEdit) {
    return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
  }

  const manager = new TodoManager(db, todoRow.list_id);
  const reminderOwnerId = todoRow.reminder_user_id || user.userId;
  // Repeats keep their local clock time in the reminder owner's (or caller's) stored time zone.
  const [timeZone, completerTimeZone] = await Promise.all([
    getUserTimeZone(db, reminderOwnerId),
    reminderOwnerId === user.userId ? undefined : getUserTimeZone(db, user.userId),
  ]);
  let updatedTodo: Awaited<ReturnType<TodoManager["toggle"]>>;
  try {
    updatedTodo = await manager.toggle(todoId, {
      timeZone,
      completerTimeZone: reminderOwnerId === user.userId ? timeZone : (completerTimeZone ?? null),
      userId: user.userId,
      isOwner: access.isOwner,
      source: "api",
    });
  } catch (err) {
    if (err instanceof CompletionAttributionError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const waitUntil = getCloudflareContext(context).ctx?.waitUntil?.bind(getCloudflareContext(context).ctx);
  const logPromise = logListActivity(db, {
    listId: todoRow.list_id,
    taskId: todoId,
    action: updatedTodo.completed || updatedTodo.rescheduled ? "task_completed" : "task_uncompleted",
    actorId: user.userId,
    isOwner: access.isOwner,
    shareMode: access.list?.share_mode,
    request,
    summary: updatedTodo.text,
  });
  if (waitUntil) waitUntil(logPromise); else await logPromise;

  return Response.json({ success: true, todo: updatedTodo });
}
