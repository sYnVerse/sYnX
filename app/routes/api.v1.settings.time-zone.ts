import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { setUserTimeZone } from "../user-profile.server";

/**
 * PUT /api/v1/settings/time-zone
 * Body: { timeZone: "America/Los_Angeles" } (IANA name from the device)
 * Stored per user so recurring tasks keep their local clock time across
 * daylight saving changes. Only this field is touched.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let timeZone: unknown;
  try {
    const body = (await request.json()) as { timeZone?: unknown };
    timeZone = body?.timeZone;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const saved = await setUserTimeZone(db, user.userId, user.email, timeZone);
  if (!saved) {
    return Response.json({ error: "Invalid time zone" }, { status: 400 });
  }

  return Response.json({ success: true, timeZone });
}
