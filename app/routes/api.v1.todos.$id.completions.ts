import type { Route } from "./+types/api.v1.todos.$id.completions";
import { getCloudflareContext } from "~/context.server";
import { getRequestApiAuth } from "~/auth-context.server";
import { getTodoCompletions } from "../to-do-manager";
import { getListAccess } from "../api-helpers.server";

/**
 * GET /api/v1/todos/:id/completions?limit=20
 * Returns completion entries and timing stats attributed to the caller.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
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
  if (!access.hasAccess) {
    return Response.json({ error: "Access denied for list" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : 20;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

  const stats = await getTodoCompletions(db, todoId, todoRow.list_id, user.userId, limit);
  return Response.json({ success: true, stats });
}
