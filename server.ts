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

    // 1. Clean up expired guest lists and their todos (via SQLite CASCADE deletion)
    try {
      await db.prepare("DELETE FROM lists WHERE expiration_ttl IS NOT NULL AND (created_at + (expiration_ttl * 1000)) <= ?").bind(now).run();
    } catch (e) {
      console.error("Failed to delete expired guest lists:", e);
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
    } catch (e) {
      console.error("Failed to query due reminders:", e);
      return;
    }

    if (dueReminders.length === 0) return;

    for (const reminder of dueReminders) {
      const promises: Promise<any>[] = [];

      const emailEnabled = Boolean(reminder.emailEnabled);
      const smsEnabled = Boolean(reminder.smsEnabled);

      // Email (Resend)
      if (reminder.email && emailEnabled && env.RESEND_API_KEY) {
        promises.push(
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "sYnX Reminders <onboarding@resend.dev>",
              to: [reminder.email],
              subject: "sYnX Task Reminder",
              html: `<strong>sYnX Reminder:</strong><p>${reminder.text}</p>`,
            }),
          }).then(res => {
            if (!res.ok) console.error("Resend email failed:", res.statusText);
          }).catch(err => console.error("Resend fetch error:", err))
        );
      }

      // SMS (Twilio or Carrier-specific Email-to-Text Gateway)
      if (reminder.phoneNumber && smsEnabled) {
        if (reminder.phoneCarrier && env.RESEND_API_KEY) {
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

            promises.push(
              fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: "sYnX Reminders <onboarding@resend.dev>",
                  to: [gatewayEmail],
                  subject: "sYnX Reminder",
                  text: `[sYnX Reminder] Task: ${reminder.text}`,
                }),
              }).then(res => {
                if (!res.ok) console.error("Email-to-Text SMS failed:", res.statusText);
              }).catch(err => console.error("Email-to-Text fetch error:", err))
            );
          } else {
            console.error(`Unknown carrier: ${reminder.phoneCarrier}`);
          }
        } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
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
              if (!res.ok) console.error("Twilio SMS failed:", res.statusText);
            }).catch(err => console.error("Twilio fetch error:", err))
          );
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
      } catch (e) {
        console.error("Failed to mark reminder sent:", e);
      }
    }
  }
} satisfies ExportedHandler<Env>;
