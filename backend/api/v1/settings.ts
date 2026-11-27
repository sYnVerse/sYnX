import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getAuthSettings } from "../../services/auth.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import { providerProfileFields, syncProviderProfile } from "../../services/provider-profile.server";
import {
  resolveDisplayName,
  sanitizeDisplayNameInput,
  syncUserProfileOnSignIn,
} from "../../services/user-profile.server";
import { phoneSettingsError } from "@synx/shared/write-limits";

interface UserSettingsRow {
  user_id: string;
  email: string | null;
  email_enabled: number | boolean | null;
  sms_enabled: number | boolean | null;
  phone_number: string | null;
  phone_carrier: string | null;
  discord_webhook_url: string | null;
  display_name: string | null;
  time_zone: string | null;
  avatar_url?: string | null;
  suggested_display_name?: string | null;
  display_name_suggestion_dismissed?: number | null;
  archive_suggestions_enabled?: number | boolean | null;
}

export async function loader({  request, context  }: ApiRouteArgs) {
  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

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

  const row = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(user.userId).first<UserSettingsRow>();

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
    /** Whether completed-list archive suggestions are enabled for this account. */
    archiveSuggestionsEnabled:
      row?.archive_suggestions_enabled === undefined || row?.archive_suggestions_enabled === null
        ? true
        : Boolean(row.archive_suggestions_enabled),
    /** Provider photo URL and suggested display name (null when unknown or not applicable). */
    ...providerProfileFields(row),
  };

  return Response.json({ success: true, settings });
}

export async function action({  request, context  }: ApiRouteArgs) {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parseBool = (v: unknown) => v === true || v === "true" || v === 1;
    const hasNotificationFields = [
      "emailEnabled",
      "smsEnabled",
      "phoneNumber",
      "phoneCarrier",
      "discordWebhookUrl",
    ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
    const hasDisplayNameField = Object.prototype.hasOwnProperty.call(body, "displayName");
    const hasArchiveSuggestionsField = Object.prototype.hasOwnProperty.call(
      body,
      "archiveSuggestionsEnabled",
    );

    if (!hasNotificationFields && !hasDisplayNameField && hasArchiveSuggestionsField) {
      const archiveSuggestionsEnabled = parseBool(body.archiveSuggestionsEnabled);
      await db
        .prepare(
          `INSERT INTO user_settings (user_id, email, archive_suggestions_enabled)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             archive_suggestions_enabled = excluded.archive_suggestions_enabled`,
        )
        .bind(user.userId, user.email || "", archiveSuggestionsEnabled ? 1 : 0)
        .run();
    } else {
      const emailEnabled = parseBool(body.emailEnabled);
      const smsEnabled = parseBool(body.smsEnabled);
      const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
      const phoneCarrier = typeof body.phoneCarrier === "string" ? body.phoneCarrier.trim() : "";
      const discordWebhookUrl =
        typeof body.discordWebhookUrl === "string" ? body.discordWebhookUrl.trim() : "";

      const phoneError = phoneSettingsError(phoneNumber, phoneCarrier);
      if (phoneError) {
        return Response.json({ error: phoneError }, { status: 400 });
      }

      if (discordWebhookUrl) {
        const DISCORD_WEBHOOK_REGEX =
          /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;
        if (!DISCORD_WEBHOOK_REGEX.test(discordWebhookUrl)) {
          return Response.json({ error: "Invalid Discord Webhook URL format" }, { status: 400 });
        }
      }

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
               display_name = excluded.display_name`,
          )
          .bind(
            user.userId,
            user.email || "",
            emailEnabled ? 1 : 0,
            smsEnabled ? 1 : 0,
            phoneNumber,
            phoneCarrier,
            discordWebhookUrl,
            displayName,
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
               discord_webhook_url = excluded.discord_webhook_url`,
          )
          .bind(
            user.userId,
            user.email || "",
            emailEnabled ? 1 : 0,
            smsEnabled ? 1 : 0,
            phoneNumber,
            phoneCarrier,
            discordWebhookUrl,
          )
          .run();
      }

      if (hasArchiveSuggestionsField) {
        await db
          .prepare("UPDATE user_settings SET archive_suggestions_enabled = ? WHERE user_id = ?")
          .bind(parseBool(body.archiveSuggestionsEnabled) ? 1 : 0, user.userId)
          .run();
      }
    }

    const row = await db
      .prepare("SELECT * FROM user_settings WHERE user_id = ?")
      .bind(user.userId)
      .first<UserSettingsRow>();

    return Response.json({
      success: true,
      settings: {
        userId: user.userId,
        email: user.email,
        displayName: resolveDisplayName(row?.display_name),
        displayNameSet: Boolean(row?.display_name && String(row.display_name).trim()),
        emailEnabled: row ? Boolean(row.email_enabled) : false,
        smsEnabled: row ? Boolean(row.sms_enabled) : false,
        phoneNumber: row ? row.phone_number || "" : "",
        phoneCarrier: row ? row.phone_carrier || "" : "",
        discordWebhookUrl: row ? row.discord_webhook_url || "" : "",
        archiveSuggestionsEnabled:
          row?.archive_suggestions_enabled === undefined || row?.archive_suggestions_enabled === null
            ? true
            : Boolean(row.archive_suggestions_enabled),
        ...providerProfileFields(row),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json({ error: message || "Invalid settings payload" }, { status: 400 });
  }
}
