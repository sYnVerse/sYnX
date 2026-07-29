import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";
import * as v from "valibot";
import { UpdateTodoSchema } from "../../shared";

export async function action({ request, params, context }: ActionFunctionArgs) {
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

  const manager = new TodoManager(db, todoRow.list_id);

  if (request.method === "PUT") {
    try {
      const body = await request.json();
      const parsed = v.parse(UpdateTodoSchema, body);
      let updatedTodo;

      if (parsed.text !== undefined) {
        updatedTodo = await manager.updateText(todoId, parsed.text);
      }
      if (parsed.priority !== undefined) {
        updatedTodo = await manager.updatePriority(todoId, parsed.priority);
      }
      if (parsed.reminderAt !== undefined) {
        updatedTodo = await manager.updateReminder(todoId, parsed.reminderAt ?? undefined);
      }
      if (parsed.recurrence !== undefined) {
        updatedTodo = await manager.updateRecurrence(todoId, parsed.recurrence);
      }
      if (parsed.durationMinutes !== undefined) {
        try {
          await db.prepare("ALTER TABLE todos ADD COLUMN duration_minutes INTEGER DEFAULT 15").run().catch(() => {});
          await db.prepare("UPDATE todos SET duration_minutes = ? WHERE id = ?").bind(parsed.durationMinutes, todoId).run();
        } catch (e) {
          console.error("Failed to update duration_minutes", e);
        }
      }

      const current = await db.prepare("SELECT * FROM todos WHERE id = ?").bind(todoId).first<any>();
      updatedTodo = current;

      return Response.json({ success: true, todo: updatedTodo });
    } catch (err: any) {
      return Response.json({ error: err.message || "Invalid update payload" }, { status: 400 });
    }
  }

  if (request.method === "DELETE") {
    await manager.delete(todoId);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
