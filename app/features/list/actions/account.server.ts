import type { ListActionContext } from "./context";
import { redirect } from "./context";
import {
  deleteRequestActivitySummary,
  listActivityForOwner,
} from "~/list-activity.server";
import { remapGuestTodoIds } from "~/guest-migration";
import {
  sanitizeDisplayNameInput,
  setUserTimeZone,
} from "~/user-profile.server";
import {
  acceptSuggestedDisplayName,
  dismissSuggestedDisplayName,
} from "~/provider-profile.server";
import { removeSharedListAccess } from "~/shared-lists.server";
import {
  approvePendingDelete,
  declinePendingDelete,
} from "~/pending-deletes.server";
import {
  MAX_LIST_NAME_LENGTH,
  MAX_TASKS_PER_LIST,
  MAX_TASK_TEXT_LENGTH,
  phoneSettingsError,
} from "~/write-limits";
import type { Todo } from "~/to-do-manager";

export async function handleListActivity(ctx: ListActionContext) {
  const { isLoggedIn, formData, activeListId, db, userId } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const listId = (formData.get("listId") as string) || activeListId;
  const beforeRaw = formData.get("before");
  const before =
    beforeRaw != null && String(beforeRaw) !== "" && Number.isFinite(Number(beforeRaw))
      ? Number(beforeRaw)
      : null;
  const result = await listActivityForOwner(db, listId, userId, { limit: 50, before });
  if (result.kind === "not_found") {
    return Response.json({ error: result.error }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return Response.json({ error: result.error }, { status: 403 });
  }
  return Response.json({ success: true, entries: result.entries, listName: result.listName });
}

export async function handleMigrateGuestLists(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId } = ctx;
  if (isLoggedIn) {
    const rawLists = formData.get("guestLists") as string;
    if (rawLists) {
      try {
        const guestLists = JSON.parse(rawLists) as Array<{
          name?: unknown;
          created_at?: unknown;
          todos?: unknown[];
        }>;
        for (const gList of guestLists) {
          const listName = (String(gList.name || "") || "My Tasks").trim().slice(0, MAX_LIST_NAME_LENGTH) || "My Tasks";
          const todos = (Array.isArray(gList.todos) ? gList.todos : [])
            .filter((todo): todo is Partial<Todo> & { text: string } => Boolean(todo && typeof (todo as { text?: unknown }).text === "string" && (todo as { text: string }).text.trim()))
            .slice(0, MAX_TASKS_PER_LIST);
          if (listName === "My Tasks" && todos.length === 0) {
            continue;
          }

          const newListId = crypto.randomUUID();
          await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, NULL)")
            .bind(newListId, listName, userId, Number(gList.created_at) || Date.now())
            .run();

          // Fresh ids for the whole list first, so subtask parentId links within the list stay valid.
          const remappedIds = remapGuestTodoIds(todos);

          for (const [index, todo] of todos.entries()) {
            const { id: todoId, parentId: mappedParentId } = remappedIds[index];
            await db.prepare(
              "INSERT INTO todos (id, list_id, text, completed, created_at, priority, reminder_at, reminder_sent, reminder_user_id, parent_id, recurrence, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(
              todoId,
              newListId,
              todo.text.slice(0, MAX_TASK_TEXT_LENGTH),
              todo.completed ? 1 : 0,
              todo.createdAt || Date.now(),
              todo.priority && todo.priority !== "none" ? todo.priority : null,
              todo.reminderAt ?? null,
              todo.reminderSent ? 1 : (todo.reminderAt ? 0 : null),
              todo.reminderAt ? userId : null,
              mappedParentId,
              todo.recurrence || "none",
              userId
            ).run();
          }
        }
      } catch (e) {
        console.error("Failed to migrate guest lists to D1:", e);
      }
    }
  }
  return Response.json({ success: true });
}

export async function handleSetTimeZone(ctx: ListActionContext) {
  const { isLoggedIn, db, userId, email, formData } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const stored = await setUserTimeZone(db, userId, email, formData.get("timeZone"), {
    onlyIfUnset: false,
  });
  if (!stored) {
    return Response.json({ error: "Invalid time zone" }, { status: 400 });
  }
  return Response.json({ success: true, timeZone: stored });
}

export async function handleInitTimeZone(ctx: ListActionContext) {
  const { isLoggedIn, db, userId, email, formData } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const stored = await setUserTimeZone(db, userId, email, formData.get("timeZone"), {
    onlyIfUnset: true,
  });
  if (!stored) {
    return Response.json({ error: "Invalid time zone" }, { status: 400 });
  }
  return Response.json({ success: true, timeZone: stored });
}

export async function handleAcceptSuggestedDisplayName(ctx: ListActionContext) {
  const { isLoggedIn, db, userId } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const saved = await acceptSuggestedDisplayName(db, userId);
  return Response.json({ success: saved });
}

export async function handleDismissSuggestedDisplayName(ctx: ListActionContext) {
  const { isLoggedIn, db, userId } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  await dismissSuggestedDisplayName(db, userId);
  return Response.json({ success: true });
}

export async function handleUpdateSettings(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId, email } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required to configure notification settings" }, { status: 401 });
  }

  const emailEnabled = formData.get("emailEnabled") === "true";
  const smsEnabled = formData.get("smsEnabled") === "true";
  const phoneNumber = (formData.get("phoneNumber") as string) || "";
  const phoneCarrier = (formData.get("phoneCarrier") as string) || "";
  const discordWebhookUrlRaw = (formData.get("discordWebhookUrl") as string) || "";
  const discordWebhookUrl = discordWebhookUrlRaw.trim();
  const displayName = sanitizeDisplayNameInput(formData.get("displayName"));

  const phoneError = phoneSettingsError(phoneNumber.trim(), phoneCarrier.trim());
  if (phoneError) {
    return Response.json({ error: phoneError }, { status: 400 });
  }

  if (discordWebhookUrl) {
    const DISCORD_WEBHOOK_REGEX = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;
    if (!DISCORD_WEBHOOK_REGEX.test(discordWebhookUrl)) {
      return Response.json({ error: "Invalid Discord Webhook URL format" }, { status: 400 });
    }
  }

  try {
    await db.prepare(
      `INSERT INTO user_settings (user_id, email, email_enabled, sms_enabled, phone_number, phone_carrier, discord_webhook_url, display_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         email_enabled = excluded.email_enabled,
         sms_enabled = excluded.sms_enabled,
         phone_number = excluded.phone_number,
         phone_carrier = excluded.phone_carrier,
         discord_webhook_url = excluded.discord_webhook_url,
         display_name = excluded.display_name`
    ).bind(
      userId,
      email || "",
      emailEnabled ? 1 : 0,
      smsEnabled ? 1 : 0,
      phoneNumber.trim(),
      phoneCarrier.trim(),
      discordWebhookUrl,
      displayName
    ).run();
  } catch (e) {
    console.error("Failed to update settings in database:", e);
  }

  return Response.json({ success: true });
}

export async function handleRemoveSharedList(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId, activeListId } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const listId = (formData.get("listId") as string) || "";
  if (!listId) {
    return Response.json({ error: "List ID is required" }, { status: 400 });
  }
  await removeSharedListAccess(db, userId, listId);
  const remainingOwned = await db
    .prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
    .bind(userId)
    .first<{ id: string }>();
  if (activeListId === listId) {
    return redirect(remainingOwned?.id ? `/${remainingOwned.id}` : "/");
  }
  return Response.json({ success: true });
}

export async function handleApproveDeleteRequest(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId, scheduleActivityLog, activeListId } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const requestId = formData.get("requestId") as string;
  if (!requestId) {
    return Response.json({ error: "Request ID is required" }, { status: 400 });
  }
  const pendingMeta = await db
    .prepare(
      `SELECT p.list_id, p.target_type, p.target_id, l.share_mode, t.text AS target_label
       FROM pending_delete_requests p
       JOIN lists l ON l.id = p.list_id
       LEFT JOIN todos t ON t.id = p.target_id AND p.target_type = 'task'
       WHERE p.id = ?`
    )
    .bind(requestId)
    .first<{
      list_id: string;
      target_type: "task" | "list" | "clear_completed";
      target_id: string;
      share_mode: string | null;
      target_label: string | null;
    }>();

  const result = await approvePendingDelete(db, requestId, userId);
  if (result.kind === "not_found") {
    return Response.json({ error: result.error }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return Response.json({ error: result.error }, { status: 403 });
  }
  scheduleActivityLog({
    listId: result.listId,
    taskId: pendingMeta?.target_type === "task" ? pendingMeta.target_id : null,
    action: "delete_approved",
    actorId: userId,
    isOwner: true,
    shareMode: pendingMeta?.share_mode,
    summary: deleteRequestActivitySummary(
      result.targetType,
      pendingMeta?.target_label
    ),
  });
  if (result.targetType === "list" && activeListId === result.listId) {
    const firstList = await db
      .prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
      .bind(userId)
      .first<{ id: string }>();
    return redirect(firstList ? `/${firstList.id}` : "/");
  }
  return Response.json({ success: true, approved: true });
}

export async function handleDeclineDeleteRequest(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId, scheduleActivityLog } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const requestId = formData.get("requestId") as string;
  if (!requestId) {
    return Response.json({ error: "Request ID is required" }, { status: 400 });
  }
  const pendingMeta = await db
    .prepare(
      `SELECT p.list_id, p.target_type, p.target_id, l.share_mode, t.text AS target_label
       FROM pending_delete_requests p
       JOIN lists l ON l.id = p.list_id
       LEFT JOIN todos t ON t.id = p.target_id AND p.target_type = 'task'
       WHERE p.id = ?`
    )
    .bind(requestId)
    .first<{
      list_id: string;
      target_type: "task" | "list" | "clear_completed";
      target_id: string;
      share_mode: string | null;
      target_label: string | null;
    }>();

  const result = await declinePendingDelete(db, requestId, userId);
  if (result.kind === "not_found") {
    return Response.json({ error: result.error }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return Response.json({ error: result.error }, { status: 403 });
  }
  scheduleActivityLog({
    listId: result.listId,
    taskId: pendingMeta?.target_type === "task" ? pendingMeta.target_id : null,
    action: "delete_declined",
    actorId: userId,
    isOwner: true,
    shareMode: pendingMeta?.share_mode,
    summary: pendingMeta
      ? deleteRequestActivitySummary(pendingMeta.target_type, pendingMeta.target_label)
      : undefined,
  });
  return Response.json({ success: true, declined: true });
}
