import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { TodoManager } from "../to-do-manager";
import * as v from "valibot";
import { CreateTodoSchema } from "../../shared";

import { getListAccess } from "../api-helpers.server";

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
  return Response.json({ success: true, todos });
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

    const manager = new TodoManager(db, parsed.listId);
    const todo = await manager.create(
      parsed.text,
      parsed.priority,
      parsed.reminderAt,
      parsed.parentId,
      parsed.recurrence,
      parsed.durationMinutes
    );

    return Response.json({ success: true, todo }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message || "Invalid request payload" }, { status: 400 });
  }
}
