import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { isLocalTestToken } from "../../services/auth.server";
import { attachTokenToAuthSession } from "../../services/auth-sessions.server";

function extractSessionId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { sessionId?: unknown }).sessionId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * POST /api/v1/sessions
 * Registers a mobile access token against a new or existing `auth_sessions` row.
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
    return Response.json({ sessionId: null });
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
  const attached = await attachTokenToAuthSession(env.DB as D1Database, {
    sessionId: extractSessionId(body),
    userId: user.userId,
    source: "mobile",
    accessToken: user.token,
  });

  if (!attached.ok) {
    return Response.json({ error: "Session revoked" }, { status: 401 });
  }

  return Response.json({ sessionId: attached.sessionId });
}
