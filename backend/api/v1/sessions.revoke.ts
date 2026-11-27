import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { isLocalTestToken } from "../../services/auth.server";
import { revokeAuthSessionForToken } from "../../services/auth-sessions.server";

function extractSessionId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { sessionId?: unknown }).sessionId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * POST /api/v1/sessions/revoke
 * Revokes the caller's mobile session and its current bearer access token.
 */
export async function action({ request, context }: ApiRouteArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getRequestApiAuth(request, context);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isLocalTestToken(user.token)) {
    return Response.json({ revoked: true, sessionId: null });
  }

  let body: unknown = null;
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { env } = getCloudflareContext(context);
  const result = await revokeAuthSessionForToken(env.DB as D1Database, {
    token: user.token,
    userId: user.userId,
    source: "mobile",
    sessionId: extractSessionId(body),
    reason: "logout_mobile",
  });

  return Response.json({ revoked: true, sessionId: result.sessionId });
}
