import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import {
  acceptSuggestedDisplayName,
  dismissSuggestedDisplayName,
} from "../provider-profile.server";
import { resolveDisplayName } from "../user-profile.server";

/**
 * POST /api/v1/settings/display-name-suggestion
 * Body: { action: "accept" | "dismiss" }
 * Answers the "Use 'Name' as your display name?" prompt. "accept" copies the name
 * sYnX stored from sYnID (never a client-supplied value) into the display name, but
 * only when none is set yet. Both answers stop the suggestion from being offered
 * again. Responds with { success, displayName, displayNameSet }.
 */
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

  let body: { action?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action !== "accept" && body.action !== "dismiss") {
    return Response.json({ error: "action must be accept or dismiss" }, { status: 400 });
  }

  const saved =
    body.action === "accept" ? await acceptSuggestedDisplayName(db, user.userId) : false;
  if (body.action === "dismiss") await dismissSuggestedDisplayName(db, user.userId);

  const row = await db
    .prepare("SELECT display_name FROM user_settings WHERE user_id = ?")
    .bind(user.userId)
    .first<{ display_name?: string | null }>();
  const displayNameSet = Boolean(row?.display_name && String(row.display_name).trim());

  return Response.json({
    success: body.action === "dismiss" || saved,
    displayName: resolveDisplayName(row?.display_name),
    displayNameSet,
  });
}
