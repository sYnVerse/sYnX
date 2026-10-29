import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import * as v from "valibot";
import { CreateTodoSchema } from "../../shared";

import { getListAccess } from "../api-helpers.server";
import { isListFull } from "../guest-access.server";
import { logListActivity } from "../list-activity.server";
import {
  listPendingDeletesForList,
  pendingTaskDeleteIds,
} from "../pending-deletes.server";
import { TASK_LIMIT_ERROR, taskTextError } from "../write-limits";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const listId = url.searchParams.get("listId");
  if (!listId) {
    return Response.json({ error: "listId query parameter is required" }, { status: 400 });
  }

  const access = await getListAccess(db, listId, user.userId);
  if (!access.hasAccess) {
    return Response.json({ error: "Access denied to list" }, { status: 403 });
  }

  const manager = new TodoManager(db, listId);
  const todos = await manager.list();
  const pendingTaskIds = await pendingTaskDeleteIds(db, listId);
  const pendingDeleteRequests = await listPendingDeletesForList(db, listId);
  const todosWithPending = todos.map((t) => ({
    ...t,
    pendingDelete: pendingTaskIds.has(t.id),
  }));
  return Response.json({
    success: true,
    todos: todosWithPending,
    pendingDeleteRequests,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = v.parse(CreateTodoSchema, body);

    const access = await getListAccess(db, parsed.listId, user.userId);
    if (!access.canEdit) {
      return Response.json({ error: "Edit permission denied for list" }, { status: 403 });
    }

    const textError = taskTextError(parsed.text);
    if (textError) {
      return Response.json({ error: textError }, { status: 400 });
    }
    if (parsed.parentId) {
      const parent = await db
        .prepare("SELECT 1 FROM todos WHERE id = ? AND list_id = ?")
        .bind(parsed.parentId, parsed.listId)
        .first();
      if (!parent) {
        return Response.json({ error: "Parent task not found" }, { status: 400 });
      }
    }
    if (await isListFull(db, parsed.listId)) {
      return Response.json({ error: TASK_LIMIT_ERROR }, { status: 400 });
    }

    const manager = new TodoManager(db, parsed.listId);
    const todo = await manager.create(
      parsed.text,
      parsed.priority,
      parsed.reminderAt,
      parsed.parentId,
      parsed.recurrence,
      parsed.durationMinutes,
      user.userId
    );

    const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);
    const logPromise = logListActivity(db, {
      listId: parsed.listId,
      taskId: todo.id,
      action: "task_created",
      actorId: user.userId,
      isOwner: access.isOwner,
      shareMode: access.list?.share_mode,
      request,
      summary: parsed.text,
    });
    if (waitUntil) waitUntil(logPromise); else await logPromise;

    return Response.json({ success: true, todo }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json({ error: message || "Invalid request payload" }, { status: 400 });
  }
}
