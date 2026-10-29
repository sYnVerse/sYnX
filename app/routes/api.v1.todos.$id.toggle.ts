import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";
import { logListActivity } from "../list-activity.server";
import { getUserTimeZone } from "../user-profile.server";

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
  // Repeats keep their local clock time in the reminder owner's (or caller's) stored time zone.
  const timeZone = await getUserTimeZone(db, todoRow.reminder_user_id || user.userId);
  const updatedTodo = await manager.toggle(todoId, { timeZone });

  const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
  const logPromise = logListActivity(db, {
    listId: todoRow.list_id,
    taskId: todoId,
    action: updatedTodo.completed ? "task_completed" : "task_uncompleted",
    actorId: user.userId,
    isOwner: access.isOwner,
    shareMode: access.list?.share_mode,
    request,
    summary: updatedTodo.text,
  });
  if (waitUntil) waitUntil(logPromise); else await logPromise;

  return Response.json({ success: true, todo: updatedTodo });
}
