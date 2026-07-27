import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { RegisterDeviceTokenSchema } from "../../shared";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
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
    } catch (err: any) {
      return Response.json({ error: err.message || "Invalid device token payload" }, { status: 400 });
    }
  }

  if (request.method === "DELETE") {
    try {
      const body = (await request.json()) as any;
      const token = body.token;
      if (typeof token === "string" && token) {
        await db.prepare("DELETE FROM device_tokens WHERE token = ? AND user_id = ?").bind(token, user.userId).run();
      }
      return Response.json({ success: true });
    } catch (err: any) {
      return Response.json({ error: err.message || "Invalid payload" }, { status: 400 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
