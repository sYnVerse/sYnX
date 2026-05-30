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
            ctx: {
              waitUntil: ctx.waitUntil.bind(ctx),
              passThroughOnException: ctx.passThroughOnException.bind(ctx),
            },
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
    const kv = env.TO_DO_LIST;
    const now = Date.now();

    const queue = (await kv.get("reminders:pending", "json") || []) as PendingReminder[];
    if (queue.length === 0) return;

    const dueReminders = queue.filter(r => r.reminderAt <= now);
    if (dueReminders.length === 0) return;

    for (const reminder of dueReminders) {
      const promises: Promise<any>[] = [];

      // Email (Resend)
      if (reminder.email && env.RESEND_API_KEY) {
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

      // SMS (Twilio)
      if (reminder.phoneNumber && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
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

      const listKey = `list:${reminder.listId}:todos`;
      const todos = (await kv.get(listKey, "json") || []) as any[];
      const todoIdx = todos.findIndex((t: any) => t.id === reminder.id);
      if (todoIdx !== -1) {
        todos[todoIdx].reminderSent = true;
        await kv.put(listKey, JSON.stringify(todos));
      }
    }

    const updatedQueue = queue.filter(r => r.reminderAt > now);
    await kv.put("reminders:pending", JSON.stringify(updatedQueue));
  }
} satisfies ExportedHandler<Env>;
