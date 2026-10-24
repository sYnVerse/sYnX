import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";
import * as v from "valibot";
import { SetTodoCompletedSchema } from "../../shared";

/**
 * POST /api/v1/todos/:id/completed
 * Idempotent explicit done-state. Body: { completed: boolean }
 * Recurring tasks marked done are rescheduled and left uncompleted (rescheduled: true).
 */
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

  const todoRow = await db.prepare("SELECT list_id FROM todos WHERE id = ?").bind(todoId).first<any>();
  if (!todoRow) {
    return Response.json({ error: "Todo not found" }, { status: 404 });
  }

  const access = await getListAccess(db, todoRow.list_id, user.userId);
  if (!access.canEdit) {
    return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
  }

  let completed: boolean;
  try {
    const body = await request.json();
    const parsed = v.parse(SetTodoCompletedSchema, body);
    completed = parsed.completed;
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Invalid payload: completed boolean required" },
      { status: 400 }
    );
  }

  const manager = new TodoManager(db, todoRow.list_id);
  const { todo, rescheduled } = await manager.setCompleted(todoId, completed);

  return Response.json({ success: true, todo, rescheduled });
}
