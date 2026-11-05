import { redirect } from "react-router";
import { getCloudflareContext } from "~/context.server";
import { getAuthSettings, getOptionalUser } from "~/auth.server";
import {
  DEFAULT_DISPLAY_NAME,
  getDisplayNamesForUsers,
  resolveDisplayName,
  syncUserProfileOnSignIn,
} from "~/user-profile.server";
import {
  providerProfileFields,
  syncProviderProfile,
} from "~/provider-profile.server";
import { listSharedWithMe, recordSharedListAccess } from "~/shared-lists.server";
import {
  listPendingDeletesForList,
  listPendingDeletesForOwner,
} from "~/pending-deletes.server";
import { listActivityForOwner } from "~/list-activity.server";
import {
  canDeleteTaskDirectly,
  canEditList,
  type ListActivityEntry,
  type PendingDeleteRequest,
  type ShareMode,
} from "../../../shared";
import type { ListRow } from "~/api-helpers.server";
import type { Todo, TodoRow } from "~/to-do-manager";
import type { GuestList } from "./guest-lists";

type LoaderListRow = ListRow & { owner_display_name?: string };

export const loader = async ({ request, params, context }: { request: Request; params: Record<string, string | undefined>; context: unknown }) => {
  const { env, ctx: execCtx } = getCloudflareContext(context);
  const { userId, email, isLoggedIn, guestId, isNewGuest, accessToken } = await getOptionalUser(request, env);
  const db = env.DB;

  const headers = new Headers();
  if (isNewGuest && guestId) {
    headers.append("Set-Cookie", `guest_session=${guestId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }

  // Keep profile (email) in sync on signed-in page loads — display name is never derived from email
  if (isLoggedIn) {
    try {
      await syncUserProfileOnSignIn(db, userId, email);
    } catch (e) {
      console.error("Failed to sync user profile:", e);
    }
    // Provider photo / suggested name from sYnID (throttled, best-effort, off the
    // response path so a slow or missing /userinfo never delays the page).
    const providerSync = syncProviderProfile(db, {
      userId,
      email,
      accessToken,
      issuer: getAuthSettings(request, env).issuer,
    });
    // execCtx is already retrieved from getCloudflareContext
    if (execCtx && typeof execCtx.waitUntil === "function") {
      execCtx.waitUntil(providerSync);
    } else {
      await providerSync;
    }
  }

  let lists: LoaderListRow[] = [];
  const activeListId = params.id;
  let activeListExists = false;

  if (isLoggedIn) {
    // Load owned lists from D1
    try {
      const { results: listRows } = await db.prepare("SELECT * FROM lists WHERE owner_id = ? ORDER BY created_at ASC").bind(userId).all<ListRow>();
      lists = listRows || [];
    } catch (e) {
      console.error("Failed to load lists:", e);
    }

    // Load previously opened shared lists (still public); private lists drop out here
    try {
      const sharedRows = await listSharedWithMe(db, userId);
      const ownedIds = new Set(lists.map((l) => l.id));
      for (const row of sharedRows) {
        if (!ownedIds.has(row.id)) lists.push(row);
      }
    } catch (e) {
      console.error("Failed to load shared-with-me lists:", e);
    }

    activeListExists = lists.some((l) => l.id === activeListId);

    if (!activeListExists && activeListId) {
      try {
        const sharedList = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(activeListId).first<ListRow>();
        if (sharedList && sharedList.share_mode && sharedList.share_mode !== "private") {
          lists.push(sharedList);
          activeListExists = true;
          await recordSharedListAccess(db, userId, activeListId, sharedList.owner_id === userId);
        }
      } catch (e) {
        console.error("Failed to query shared list:", e);
      }
    } else if (activeListExists && activeListId) {
      const active = lists.find((l) => l.id === activeListId);
      if (active && active.owner_id !== userId) {
        await recordSharedListAccess(db, userId, activeListId, false);
      }
    }

    // Default setup if no lists exist for logged-in user
    if (lists.length === 0) {
      const defaultListId = crypto.randomUUID();
      try {
        await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)")
          .bind(defaultListId, "My Tasks", userId, Date.now(), null)
          .run();
      } catch (e) {
        console.error("Failed to create default list:", e);
      }
      return redirect(`/${defaultListId}`);
    }

    if (!activeListExists && lists.length > 0) {
      return redirect(`/${lists[0].id}`);
    }
  } else {
    // Guest user (isLoggedIn === false): DO NOT touch D1 for personal guest lists!
    // Check if params.id matches a shared list from D1
    if (activeListId) {
      try {
        const sharedList = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(activeListId).first<ListRow>();
        if (sharedList && sharedList.share_mode && sharedList.share_mode !== "private") {
          lists.push(sharedList);
          activeListExists = true;
        }
      } catch (e) {
        console.error("Failed to query shared list for guest:", e);
      }
    }
  }

  // Attach owner display names (never email) for shared-list UI
  try {
    const ownerNames = await getDisplayNamesForUsers(
      db,
      lists.map((l) => l.owner_id)
    );
    lists = lists.map((l) => ({
      ...l,
      owner_display_name: ownerNames.get(l.owner_id) || DEFAULT_DISPLAY_NAME,
    }));
  } catch (e) {
    console.error("Failed to resolve owner display names:", e);
    lists = lists.map((l) => ({
      ...l,
      owner_display_name: DEFAULT_DISPLAY_NAME,
    }));
  }

  // Load all todos for any lists loaded from D1 (logged in user or shared list)
  let allTodos: TodoRow[] = [];
  const listIds = lists.map((l) => l.id);
  if (listIds.length > 0) {
    try {
      const placeholders = listIds.map(() => "?").join(",");
      const { results } = await db.prepare(`
        SELECT * FROM todos WHERE list_id IN (${placeholders})
      `).bind(...listIds).all<TodoRow>();
      allTodos = results || [];
    } catch (e) {
      console.error("Failed to query todos:", e);
    }
  }

  // Pending delete requests for the active list (collaborators see markers;
  // owners also get the full owned-lists queue below).
  let pendingDeleteRequests: PendingDeleteRequest[] = [];
  let pendingTaskIds = new Set<string>();
  try {
    if (activeListId) {
      pendingDeleteRequests = await listPendingDeletesForList(db, activeListId);
      pendingTaskIds = new Set(
        pendingDeleteRequests
          .filter((r) => r.targetType === "task" && r.targetId)
          .map((r) => r.targetId)
      );
    }
    if (isLoggedIn) {
      // Owners see every pending request across their lists in the review panel.
      const ownedPending = await listPendingDeletesForOwner(db, userId);
      const byId = new Map<string, PendingDeleteRequest>();
      for (const r of [...ownedPending, ...pendingDeleteRequests]) {
        byId.set(r.id, r);
      }
      pendingDeleteRequests = Array.from(byId.values()).sort(
        (a, b) => a.createdAt - b.createdAt
      );
    }
  } catch (e) {
    console.error("Failed to load pending delete requests:", e);
  }

  // Owner-only activity for the active shared list (private lists have no log).
  let listActivity: ListActivityEntry[] = [];
  try {
    if (isLoggedIn && activeListId) {
      const activeMeta = lists.find((l) => l.id === activeListId);
      if (
        activeMeta &&
        activeMeta.owner_id === userId &&
        (activeMeta.share_mode || "private") !== "private"
      ) {
        const activity = await listActivityForOwner(db, activeListId, userId, { limit: 50 });
        if (activity.kind === "ok") listActivity = activity.entries;
      }
    }
  } catch (e) {
    console.error("Failed to load list activity:", e);
  }

  const listsWithTodos: GuestList[] = lists.map((list) => {
    const listRows = allTodos.filter((t) => t.list_id === list.id);
    const listCreators = listRows.map((t) => ({
      id: t.id,
      parentId: t.parent_id,
      createdBy: t.created_by,
    }));
    const listTodos: Todo[] = listRows
      .map((t) => ({
        id: t.id,
        listId: t.list_id,
        text: t.text,
        completed: Boolean(t.completed),
        createdAt: Number(t.created_at),
        priority: (t.priority || "none") as "low" | "medium" | "high" | "none",
        reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
        reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
        reminderUserId: t.reminder_user_id || undefined,
        parentId: t.parent_id || undefined,
        recurrence: (t.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
        durationMinutes: t.duration_minutes !== null && t.duration_minutes !== undefined ? Number(t.duration_minutes) : undefined,
        pendingDelete: pendingTaskIds.has(t.id),
        createdBy: t.created_by || undefined,
        canDeleteDirectly: canDeleteTaskDirectly({
          tasks: listCreators,
          taskId: t.id,
          userId: isLoggedIn ? userId : null,
          isOwner: isLoggedIn && list.owner_id === userId,
          canEdit: canEditList((list.share_mode || "private") as ShareMode, isLoggedIn && list.owner_id === userId, isLoggedIn),
        }),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    return {
      ...list,
      todos: listTodos,
    };
  });

  const activeList = listsWithTodos.find((l) => l.id === activeListId);
  const todos = activeList ? activeList.todos : [];

  const totalLists = listsWithTodos.length;
  let totalTasks = 0;
  let completedTasks = 0;
  for (const item of listsWithTodos) {
    totalTasks += item.todos.length;
    completedTasks += item.todos.filter((t) => t.completed).length;
  }

  // Load settings
  let settings = {
    emailEnabled: false,
    smsEnabled: false,
    phoneNumber: "",
    phoneCarrier: "",
    discordWebhookUrl: "",
    displayName: DEFAULT_DISPLAY_NAME,
    displayNameSet: false,
    timeZone: null as string | null,
    /** Provider profile photo (Google, GitHub or Microsoft work/school via sYnID), or null. */
    avatarUrl: null as string | null,
    /** Provider name offered as a display name; null once set, accepted or dismissed. */
    suggestedDisplayName: null as string | null,
  };
  if (userId && isLoggedIn) {
    try {
      const settingsVal = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).first<{
        email_enabled?: number | boolean | null;
        sms_enabled?: number | boolean | null;
        phone_number?: string | null;
        phone_carrier?: string | null;
        discord_webhook_url?: string | null;
        display_name?: string | null;
        time_zone?: string | null;
        avatar_url?: string | null;
        suggested_display_name?: string | null;
        display_name_suggestion_dismissed?: number | null;
      }>();
      if (settingsVal) {
        settings = {
          emailEnabled: Boolean(settingsVal.email_enabled),
          smsEnabled: Boolean(settingsVal.sms_enabled),
          phoneNumber: settingsVal.phone_number || "",
          phoneCarrier: settingsVal.phone_carrier || "",
          discordWebhookUrl: settingsVal.discord_webhook_url || "",
          displayName: resolveDisplayName(settingsVal.display_name),
          displayNameSet: Boolean(settingsVal.display_name && String(settingsVal.display_name).trim()),
          timeZone: settingsVal.time_zone || null,
          ...providerProfileFields(settingsVal),
        };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  const responsePayload = {
    userId,
    email,
    isLoggedIn,
    settings,
    lists: listsWithTodos,
    activeListId: activeListId || userId,
    todos,
    pendingDeleteRequests,
    listActivity,
    stats: {
      totalLists,
      totalTasks,
      completedTasks,
    },
  };

  if (isNewGuest && guestId) {
    return Response.json(responsePayload, { headers });
  }

  return responsePayload;
};
