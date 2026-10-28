import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { getAuthSettings, verifyBearerToken } from "../auth.server";
import { providerProfileFields, syncProviderProfile } from "../provider-profile.server";
import {
  resolveDisplayName,
  sanitizeDisplayNameInput,
  syncUserProfileOnSignIn,
} from "../user-profile.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncUserProfileOnSignIn(db, user.userId, user.email);
  // Throttled, best-effort provider photo / suggested name (never sets displayName).
  await syncProviderProfile(db, {
    userId: user.userId,
    email: user.email,
    accessToken: user.token,
    issuer: getAuthSettings(request, env).issuer,
  });

  const row = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(user.userId).first<any>();

  const settings = {
    userId: user.userId,
    email: user.email,
    displayName: resolveDisplayName(row?.display_name),
    /** True when the user has explicitly set a display name (not the default). */
    displayNameSet: Boolean(row?.display_name && String(row.display_name).trim()),
    emailEnabled: row ? Boolean(row.email_enabled) : false,
    smsEnabled: row ? Boolean(row.sms_enabled) : false,
    phoneNumber: row ? row.phone_number || "" : "",
    phoneCarrier: row ? row.phone_carrier || "" : "",
    discordWebhookUrl: row ? row.discord_webhook_url || "" : "",
    /** Home time zone (IANA) for repeating reminders, or null until a device sets it. */
    timeZone: row?.time_zone || null,
    /** Provider photo URL and suggested display name (null when unknown or not applicable). */
    ...providerProfileFields(row),
  };

  return Response.json({ success: true, settings });
}

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

  try {
    const body = (await request.json()) as any;
    const parseBool = (v: any) => v === true || v === "true" || v === 1;
    const emailEnabled = parseBool(body.emailEnabled);
    const smsEnabled = parseBool(body.smsEnabled);
    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    const phoneCarrier = typeof body.phoneCarrier === "string" ? body.phoneCarrier.trim() : "";
    const discordWebhookUrl =
      typeof body.discordWebhookUrl === "string" ? body.discordWebhookUrl.trim() : "";

    if (discordWebhookUrl) {
      const DISCORD_WEBHOOK_REGEX =
        /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;
      if (!DISCORD_WEBHOOK_REGEX.test(discordWebhookUrl)) {
        return Response.json({ error: "Invalid Discord Webhook URL format" }, { status: 400 });
      }
    }

    const hasDisplayNameField = Object.prototype.hasOwnProperty.call(body, "displayName");
    const displayName = hasDisplayNameField ? sanitizeDisplayNameInput(body.displayName) : undefined;

    if (hasDisplayNameField) {
      await db
        .prepare(
          `INSERT INTO user_settings (user_id, email, email_enabled, sms_enabled, phone_number, phone_carrier, discord_webhook_url, display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             email_enabled = excluded.email_enabled,
             sms_enabled = excluded.sms_enabled,
             phone_number = excluded.phone_number,
             phone_carrier = excluded.phone_carrier,
             discord_webhook_url = excluded.discord_webhook_url,
             display_name = excluded.display_name`
        )
        .bind(
          user.userId,
          user.email || "",
          emailEnabled ? 1 : 0,
          smsEnabled ? 1 : 0,
          phoneNumber,
          phoneCarrier,
          discordWebhookUrl,
          displayName
        )
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO user_settings (user_id, email, email_enabled, sms_enabled, phone_number, phone_carrier, discord_webhook_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             email_enabled = excluded.email_enabled,
             sms_enabled = excluded.sms_enabled,
             phone_number = excluded.phone_number,
             phone_carrier = excluded.phone_carrier,
             discord_webhook_url = excluded.discord_webhook_url`
        )
        .bind(
          user.userId,
          user.email || "",
          emailEnabled ? 1 : 0,
          smsEnabled ? 1 : 0,
          phoneNumber,
          phoneCarrier,
          discordWebhookUrl
        )
        .run();
    }

    const row = await db
      .prepare(
        "SELECT display_name, avatar_url, suggested_display_name, display_name_suggestion_dismissed FROM user_settings WHERE user_id = ?"
      )
      .bind(user.userId)
      .first<{
        display_name?: string | null;
        avatar_url?: string | null;
        suggested_display_name?: string | null;
        display_name_suggestion_dismissed?: number | null;
      }>();

    return Response.json({
      success: true,
      settings: {
        userId: user.userId,
        email: user.email,
        displayName: resolveDisplayName(row?.display_name),
        displayNameSet: Boolean(row?.display_name && String(row.display_name).trim()),
        emailEnabled,
        smsEnabled,
        phoneNumber,
        phoneCarrier,
        discordWebhookUrl,
        ...providerProfileFields(row),
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message || "Invalid settings payload" }, { status: 400 });
  }
}
