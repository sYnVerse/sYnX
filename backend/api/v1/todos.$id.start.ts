import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { TodoManager } from "../../services/to-do-manager";
import { getListAccess } from "../../services/api-helpers.server";
import * as v from "valibot";
import { StartTodoSchema } from "@synx/shared";

/**
 * POST /api/v1/todos/:id/start — starts a running timer on a task.
 * DELETE /api/v1/todos/:id/start — clears a running timer without completing.
 */
export async function action({ request, params, context }: ApiRouteArgs<{ id: string }>) {
  if (request.method !== "POST" && request.method !== "DELETE") {
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

  const manager = new TodoManager(db, todoRow.list_id);

  if (request.method === "DELETE") {
    const todo = await manager.cancelStartTodo(todoId);
    return Response.json({ success: true, todo });
  }

  let startedAt: number | undefined;
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      const body = JSON.parse(raw);
      const parsed = v.parse(StartTodoSchema, body);
      startedAt = parsed.startedAt;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json(
      { error: message || "Invalid start payload" },
      { status: 400 }
    );
  }

  const todo = await manager.startTodo(todoId, user.userId, startedAt);
  return Response.json({ success: true, todo });
}
