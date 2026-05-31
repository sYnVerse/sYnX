import { createRequestHandler, type ServerBuild } from "@remix-run/cloudflare";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore This file won’t exist if it hasn’t yet been built
import * as build from "./build/server";
import { getLoadContext } from "./load-context";

import { type PendingReminder } from "./app/to-do-manager";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleRemixRequest = createRequestHandler(build as any as ServerBuild);

export default {
  async fetch(request, env, ctx) {
    try {
      const loadContext = getLoadContext({
        request,
        context: {
          cloudflare: {
            cf: request.cf,
            ctx,
            caches,
            env,
          },
        },
      });
      return await handleRemixRequest(request, loadContext);
    } catch (error) {
      console.log(error);
      return new Response("An unexpected error occurred", { status: 500 });
    }
  },

  async scheduled(event, env: any, ctx) {
    const db = env.DB;
    const now = Date.now();

    console.log(`[Cron] Scheduled job started at ${new Date(now).toISOString()}`);

    // 1. Clean up expired guest lists and their todos (via SQLite CASCADE deletion)
    try {
      const cleanResult = await db.prepare("DELETE FROM lists WHERE expiration_ttl IS NOT NULL AND (created_at + (expiration_ttl * 1000)) <= ?").bind(now).run();
      console.log(`[Cron] Expired list cleanup executed. Changes: ${cleanResult.meta.changes}`);
    } catch (e) {
      console.error("[Cron] Failed to delete expired guest lists:", e);
    }

    // 2. Fetch due reminders with user settings and emails
    let dueReminders: any[] = [];
    try {
      const { results } = await db.prepare(`
        SELECT 
          t.id, t.list_id as listId, t.text, t.reminder_at as reminderAt,
          l.owner_id as userId,
          s.email, s.email_enabled as emailEnabled, s.sms_enabled as smsEnabled, 
          s.phone_number as phoneNumber, s.phone_carrier as phoneCarrier, s.discord_webhook_url as discordWebhookUrl
        FROM todos t
        JOIN lists l ON t.list_id = l.id
        LEFT JOIN user_settings s ON l.owner_id = s.user_id
        WHERE t.completed = 0 
          AND t.reminder_at IS NOT NULL 
          AND (t.reminder_sent IS NULL OR t.reminder_sent = 0)
          AND t.reminder_at <= ?
      `).bind(now).all();
      dueReminders = results || [];
      console.log(`[Cron] Found ${dueReminders.length} due reminders.`);
    } catch (e) {
      console.error("[Cron] Failed to query due reminders:", e);
      return;
    }

    if (dueReminders.length === 0) return;

    if (!env.RESEND_API_KEY) {
      console.warn("[Cron] WARNING: RESEND_API_KEY is not defined in the environment. Email and Email-to-Text notifications will be skipped.");
    }

    for (const reminder of dueReminders) {
      const promises: Promise<any>[] = [];

      const emailEnabled = Boolean(reminder.emailEnabled);
      const smsEnabled = Boolean(reminder.smsEnabled);

      console.log(`[Cron] Processing reminder ID: ${reminder.id}. Email Enabled: ${emailEnabled}, SMS Enabled: ${smsEnabled}`);

      // Email (Resend)
      if (reminder.email && emailEnabled) {
        if (env.RESEND_API_KEY) {
          console.log(`[Cron] Sending email notification to ${reminder.email}...`);
          promises.push(
            fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "sYnX Reminders <no-reply@synx.christran.io>",
                to: [reminder.email],
                subject: "sYnX Task Reminder",
                html: `<strong>sYnX Reminder:</strong><p>${reminder.text}</p>`,
              }),
            }).then(res => {
              if (!res.ok) {
                console.error(`[Cron] Resend email failed with status ${res.status}:`, res.statusText);
              } else {
                console.log(`[Cron] Email notification sent successfully to ${reminder.email}.`);
              }
            }).catch(err => console.error("[Cron] Resend fetch error:", err))
          );
        } else {
          console.warn(`[Cron] Skipped email to ${reminder.email} because RESEND_API_KEY is missing.`);
        }
      }

      // SMS (Twilio or Carrier-specific Email-to-Text Gateway)
      if (reminder.phoneNumber && smsEnabled) {
        if (reminder.phoneCarrier) {
          if (env.RESEND_API_KEY) {
            const carrierDomains: Record<string, string> = {
              verizon: "vtext.com",
              att: "txt.att.net",
              tmobile: "tmomail.net",
              sprint: "messaging.sprintpcs.com",
              boost: "myboostmobile.com",
              cricket: "sms.cricketwireless.net",
              uscellular: "email.uscc.net",
              googlefi: "msg.fi.google.com",
            };

            const domain = carrierDomains[reminder.phoneCarrier.toLowerCase()];
            if (domain) {
              const cleanPhone = reminder.phoneNumber.replace(/\D/g, "");
              const displayPhone = cleanPhone.length > 10 ? cleanPhone.substring(cleanPhone.length - 10) : cleanPhone;
              const gatewayEmail = `${displayPhone}@${domain}`;

              console.log(`[Cron] Sending SMS via Email-to-Text gateway: ${gatewayEmail}...`);
              promises.push(
                fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    from: "sYnX Reminders <no-reply@synx.christran.io>",
                    to: [gatewayEmail],
                    subject: "sYnX Reminder",
                    text: `[sYnX Reminder] Task: ${reminder.text}`,
                  }),
                }).then(res => {
                  if (!res.ok) {
                    console.error(`[Cron] Email-to-Text SMS failed with status ${res.status}:`, res.statusText);
                  } else {
                    console.log(`[Cron] Email-to-Text SMS sent successfully to ${gatewayEmail}.`);
                  }
                }).catch(err => console.error("[Cron] Email-to-Text fetch error:", err))
              );
            } else {
              console.error(`[Cron] Unknown carrier: ${reminder.phoneCarrier}`);
            }
          } else {
            console.warn(`[Cron] Skipped SMS gateway for ${reminder.phoneNumber} because RESEND_API_KEY is missing.`);
          }
        } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
          console.log(`[Cron] Sending SMS via Twilio to ${reminder.phoneNumber}...`);
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
          const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
          const formData = new URLSearchParams();
          formData.append("To", reminder.phoneNumber);
          formData.append("From", env.TWILIO_FROM_NUMBER);
          formData.append("Body", `[sYnX Reminder] Task: ${reminder.text}`);

          promises.push(
            fetch(twilioUrl, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formData.toString(),
            }).then(res => {
              if (!res.ok) {
                console.error(`[Cron] Twilio SMS failed with status ${res.status}:`, res.statusText);
              } else {
                console.log(`[Cron] Twilio SMS sent successfully to ${reminder.phoneNumber}.`);
              }
            }).catch(err => console.error("[Cron] Twilio fetch error:", err))
          );
        } else {
          console.warn(`[Cron] Skipped SMS for ${reminder.phoneNumber} because neither carrier nor Twilio config is available.`);
        }
      }

      // Discord Webhook
      if (reminder.discordWebhookUrl) {
        promises.push(
          fetch(reminder.discordWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `⏰ **sYnX Task Reminder:** ${reminder.text}`,
            }),
          }).then(res => {
            if (!res.ok) console.error("Discord Webhook failed:", res.statusText);
          }).catch(err => console.error("Discord fetch error:", err))
        );
      }

      if (promises.length > 0) {
        ctx.waitUntil(Promise.all(promises));
      }

      // Mark reminder as sent in the database
      try {
        await db.prepare("UPDATE todos SET reminder_sent = 1 WHERE id = ?").bind(reminder.id).run();
        console.log(`[Cron] Marked reminder ID ${reminder.id} as sent in database.`);
      } catch (e) {
        console.error("[Cron] Failed to mark reminder sent:", e);
      }
    }
  }
} satisfies ExportedHandler<Env>;
