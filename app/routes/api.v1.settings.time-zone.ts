import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import { setUserTimeZone } from "../user-profile.server";

/**
 * PUT /api/v1/settings/time-zone
 * Body: { timeZone: "America/Los_Angeles", onlyIfUnset?: boolean }
 * Sets the user's home time zone (IANA name), which keeps repeating reminders
 * at the same local time across daylight saving changes. With onlyIfUnset the
 * call only fills in a missing value (first run) and never replaces one.
 * Responds with the stored home zone. Only this field is touched.
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

  let body: { timeZone?: unknown; onlyIfUnset?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stored = await setUserTimeZone(db, user.userId, user.email, body.timeZone, {
    onlyIfUnset: body.onlyIfUnset === true,
  });
  if (!stored) {
    return Response.json({ error: "Invalid time zone" }, { status: 400 });
  }

  return Response.json({ success: true, timeZone: stored });
}
