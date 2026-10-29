import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { RegisterDeviceTokenSchema } from "../../shared";

/** FCM and APNs tokens are a few hundred characters at most. */
const MAX_PUSH_TOKEN_LENGTH = 1024;

/** Reads the push token from a DELETE request's JSON body or `?token=` query. */
async function readPushTokenForDelete(request: Request): Promise<string | null> {
  let candidate: unknown = new URL(request.url).searchParams.get("token");
  if (!candidate) {
    try {
      const body = (await request.json()) as { token?: unknown } | null;
      candidate = body?.token;
    } catch {
      candidate = null;
    }
  }
  if (typeof candidate !== "string") return null;
  const token = candidate.trim();
  if (!token || token.length > MAX_PUSH_TOKEN_LENGTH) return null;
  return token;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;

  if (request.method === "DELETE") {
    // Unregistering must work after the session has expired (sign-out, forced
    // sign-out), so the device's push token is enough on its own. With a valid
    // session the delete is also scoped to that user. Always 204, so a client
    // never retries.
    const token = await readPushTokenForDelete(request);
    if (token) {
      try {
        const user = await verifyBearerToken(request, env).catch(() => null);
        if (user) {
          await db
            .prepare("DELETE FROM device_tokens WHERE token = ? AND user_id = ?")
            .bind(token, user.userId)
            .run();
        } else {
          await db.prepare("DELETE FROM device_tokens WHERE token = ?").bind(token).run();
        }
      } catch (err) {
        console.error("[devices] Failed to unregister push token:", err);
      }
    }
    return new Response(null, { status: 204 });
  }

  const user = await verifyBearerToken(request, env);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    try {
      const body = await request.json();
      const parsed = v.parse(RegisterDeviceTokenSchema, body);
      const id = crypto.randomUUID();
      const updatedAt = Date.now();

      await db
        .prepare(
          `INSERT INTO device_tokens (id, user_id, token, platform, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(token) DO UPDATE SET
             user_id = excluded.user_id,
             platform = excluded.platform,
             updated_at = excluded.updated_at`
        )
        .bind(id, user.userId, parsed.token, parsed.platform, updatedAt)
        .run();

      return Response.json({ success: true }, { status: 201 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      return Response.json({ error: message || "Invalid device token payload" }, { status: 400 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
