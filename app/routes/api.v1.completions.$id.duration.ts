import type { Route } from "./+types/api.v1.completions.$id.duration";
import { getCloudflareContext } from "~/context.server";
import { getRequestApiAuth } from "~/auth-context.server";
import { setCompletionDuration } from "../to-do-manager";
import * as v from "valibot";
import { SetCompletionDurationSchema } from "../../shared";

/**
 * POST /api/v1/completions/:id/duration
 * Records a quick-pick duration (in minutes) on the caller's own untimed completion row.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const completionId = params.id;
  if (!completionId) {
    return Response.json({ error: "Completion ID is required" }, { status: 400 });
  }

  let durationMinutes: number;
  try {
    const body = await request.json();
    const parsed = v.parse(SetCompletionDurationSchema, body);
    durationMinutes = parsed.durationMinutes;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json(
      { error: message || "Invalid payload: durationMinutes required" },
      { status: 400 }
    );
  }

  const completion = await setCompletionDuration(db, completionId, user.userId, durationMinutes);
  if (!completion) {
    return Response.json({ error: "Completion entry not found or already timed" }, { status: 404 });
  }

  return Response.json({ success: true, completion });
}
