import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";
import {
  deleteRequestActivitySummary,
  logListActivity,
} from "../list-activity.server";
import { requestOrPerformDelete } from "../pending-deletes.server";
import * as v from "valibot";
import { UpdateTodoSchema } from "../../shared";
import { taskTextError } from "../write-limits";

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

  const todoRow = await db
    .prepare("SELECT list_id, text FROM todos WHERE id = ?")
    .bind(todoId)
    .first<{ list_id: string; text: string }>();
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
      const textError = parsed.text !== undefined ? taskTextError(parsed.text) : null;
      if (textError) {
        return Response.json({ error: textError }, { status: 400 });
      }
      let updatedTodo;
      const textChanged =
        parsed.text !== undefined && parsed.text !== todoRow.text;

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
        updatedTodo = await manager.updateDuration(todoId, parsed.durationMinutes);
      }

      const current = await db.prepare("SELECT * FROM todos WHERE id = ?").bind(todoId).first<any>();
      updatedTodo = current;

      const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
      const logPromise = logListActivity(db, {
        listId: todoRow.list_id,
        taskId: todoId,
        action: "task_edited",
        actorId: user.userId,
        isOwner: access.isOwner,
        shareMode: access.list?.share_mode,
        request,
        summary: textChanged ? parsed.text : undefined,
      });
      if (waitUntil) waitUntil(logPromise); else await logPromise;

      return Response.json({ success: true, todo: updatedTodo });
    } catch (err: any) {
      return Response.json({ error: err.message || "Invalid update payload" }, { status: 400 });
    }
  }

  if (request.method === "DELETE") {
    const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
    const result = await requestOrPerformDelete(db, {
      listId: todoRow.list_id,
      userId: user.userId,
      isOwner: access.isOwner,
      canEdit: access.canEdit,
      targetType: "task",
      targetId: todoId,
      env,
      waitUntil,
    });

    if (result.kind === "deleted" || result.kind === "requested") {
      const logPromise = logListActivity(db, {
        listId: todoRow.list_id,
        taskId: todoId,
        action: result.kind === "requested" ? "delete_requested" : "task_deleted",
        actorId: user.userId,
        isOwner: access.isOwner,
        shareMode: access.list?.share_mode,
        request,
        summary:
          result.kind === "requested"
            ? deleteRequestActivitySummary("task", todoRow.text)
            : todoRow.text,
      });
      if (waitUntil) waitUntil(logPromise); else await logPromise;
    }

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
    if (result.kind === "not_found") {
      return Response.json({ error: result.error }, { status: 404 });
    }
    if (result.kind === "bad_request") {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ error: result.error }, { status: 403 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
