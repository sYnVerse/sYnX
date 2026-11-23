import type { Route } from "./+types/api.v1.todos.$id.completed";
import { getCloudflareContext } from "~/context.server";
import { getRequestApiAuth } from "~/auth-context.server";
import { CompletionAttributionError, TodoManager } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";
import { logListActivity } from "../list-activity.server";
import { getUserTimeZone } from "../user-profile.server";
import * as v from "valibot";
import { SetTodoCompletedSchema, type CompletionSource } from "../../shared";

/**
 * POST /api/v1/todos/:id/completed
 * Idempotent explicit done-state. Body: { completed: boolean, completedAt?, source?, opId? }
 * Recurring tasks marked done are rescheduled and left uncompleted (rescheduled: true).
 */
export async function action({  request, params, context  }: Route.ActionArgs) {
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

  let completed: boolean;
  let subtaskAction: "complete" | "promote" | undefined;
  let completedAt: number | undefined;
  let source: CompletionSource | undefined;
  let opId: string | undefined;
  try {
    const body = await request.json();
    const parsed = v.parse(SetTodoCompletedSchema, body);
    completed = parsed.completed;
    subtaskAction = parsed.subtaskAction;
    completedAt = parsed.completedAt;
    source = parsed.source;
    opId = parsed.opId;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json(
      { error: message || "Invalid payload: completed boolean required" },
      { status: 400 }
    );
  }

  const manager = new TodoManager(db, todoRow.list_id);
  const reminderOwnerId = todoRow.reminder_user_id || user.userId;
  // Repeats keep their local clock time in the reminder owner's (or caller's) stored time zone,
  // while the completion row records the caller's own stored time zone.
  const [timeZone, completerTimeZone] = await Promise.all([
    getUserTimeZone(db, reminderOwnerId),
    reminderOwnerId === user.userId ? undefined : getUserTimeZone(db, user.userId),
  ]);
  let todo: Awaited<ReturnType<TodoManager["setCompleted"]>>["todo"];
  let rescheduled = false;
  let updatedSubtasks: Awaited<ReturnType<TodoManager["setCompleted"]>>["updatedSubtasks"];
  let completion: Awaited<ReturnType<TodoManager["setCompleted"]>>["completion"];
  try {
    ({ todo, rescheduled, updatedSubtasks, completion } = await manager.setCompleted(todoId, completed, {
      timeZone,
      completerTimeZone: reminderOwnerId === user.userId ? timeZone : (completerTimeZone ?? null),
      subtaskAction,
      userId: user.userId,
      isOwner: access.isOwner,
      completedAt,
      source: source ?? "app",
      opId,
    }));
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
    action: completed ? "task_completed" : "task_uncompleted",
    actorId: user.userId,
    isOwner: access.isOwner,
    shareMode: access.list?.share_mode,
    request,
    summary: todo?.text,
  });
  if (waitUntil) waitUntil(logPromise); else await logPromise;

  return Response.json({
    success: true,
    todo,
    rescheduled,
    updatedSubtasks: updatedSubtasks ?? [],
    completion: completion ?? null,
  });
}
