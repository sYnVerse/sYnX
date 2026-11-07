import type { Route } from "./+types/api.v1.todos.$id.mark-reminder-sent";
import { getCloudflareContext } from "~/context.server";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";

export async function action({  request, params, context  }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todoId = params.id;
  if (!todoId) {
    return Response.json({ error: "Todo ID is required" }, { status: 400 });
  }

  const todoRow = await db.prepare("SELECT list_id FROM todos WHERE id = ?").bind(todoId).first<{ list_id: string }>();
  if (!todoRow) {
    return Response.json({ error: "Todo not found" }, { status: 404 });
  }

  const access = await getListAccess(db, todoRow.list_id, user.userId);
  if (!access.canEdit) {
    return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
  }

  const manager = new TodoManager(db, todoRow.list_id);
  const updatedTodo = await manager.markReminderSent(todoId);

  return Response.json({ success: true, todo: updatedTodo });
}
