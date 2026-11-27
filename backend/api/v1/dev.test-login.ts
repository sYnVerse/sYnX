import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { isLocalTestAuthAllowed, mintLocalTestToken } from "../../services/auth.server";
import { isGuestId } from "../../services/guest-access.server";
import { syncUserProfileOnSignIn } from "../../services/user-profile.server";

const DEFAULT_MOBILE_E2E_USER_ID = "user_mobile_e2e";

export function loader() {
  return new Response("Not Found", { status: 404 });
}

export async function action({ request, context }: ApiRouteArgs) {
  const { env } = getCloudflareContext(context);

  // Strictly impossible outside local dev/CI: requires ALLOW_DEV_TEST_AUTH === "true"
  // AND an http:// loopback origin (127.0.0.1 / localhost / ::1 / *.localhost).
  if (!isLocalTestAuthAllowed(request, env)) {
    return new Response("Not Found", { status: 404 });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: Record<string, unknown> = {};
  const rawBody = await request.text();
  if (rawBody.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
    }
  }

  let userId = DEFAULT_MOBILE_E2E_USER_ID;
  if (body.userId !== undefined) {
    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return Response.json({ error: "Invalid test user ID: ID cannot be empty" }, { status: 400 });
    }
    userId = body.userId.trim();
  }

  if (userId === "guest" || userId.startsWith("guest_") || isGuestId(userId)) {
    return Response.json(
      { error: "Invalid test user ID: guest IDs cannot be used for authenticated sessions" },
      { status: 400 }
    );
  }

  let email = `${userId}@e2e.local`;
  if (body.email !== undefined) {
    if (typeof body.email !== "string" || !body.email.trim().includes("@")) {
      return Response.json({ error: "Invalid test email: must be a valid email address" }, { status: 400 });
    }
    email = body.email.trim();
  }

  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : undefined;

  const db = env.DB;
  if (db) {
    await syncUserProfileOnSignIn(db, userId, email);
    if (displayName) {
      await db
        .prepare(
          `INSERT INTO user_settings (user_id, email, display_name)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`
        )
        .bind(userId, email, displayName)
        .run();
    }
  }

  const token = mintLocalTestToken({ userId, email });

  return Response.json(
    { token, userId, email },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
