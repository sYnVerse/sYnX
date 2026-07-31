import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect,
  json,
} from "@remix-run/cloudflare";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { TodoManager, type Todo, type UserSettings } from "~/to-do-manager";
import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react";
import { CalendarView } from "~/components/calendar-view";
import { getOptionalUser } from "~/auth.server";

export const GUEST_STORAGE_KEY = "synx_guest_lists";

export interface GuestList {
  id: string;
  name: string;
  owner_id: string;
  created_at: number;
  share_mode?: string;
  todos: Todo[];
}

export const GuestContext = createContext<{
  isLoggedIn: boolean;
  onGuestAction: (intent: string, payload: any) => void;
}>({
  isLoggedIn: false,
  onGuestAction: () => {},
});

export function loadGuestListsFromStorage(guestId: string): GuestList[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load guest lists from localStorage:", e);
  }
  const defaultList: GuestList = {
    id: guestId || "guest_default",
    name: "My Tasks",
    owner_id: guestId || "guest",
    created_at: Date.now(),
    share_mode: "private",
    todos: [],
  };
  const initial = [defaultList];
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(initial));
  } catch (e) {}
  return initial;
}

export function saveGuestListsToStorage(guestLists: GuestList[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestLists));
  } catch (e) {
    console.error("Failed to save guest lists to localStorage:", e);
  }
}


export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const { userId, email, isLoggedIn, guestId, isNewGuest } = await getOptionalUser(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const headers = new Headers();
  if (isNewGuest && guestId) {
    headers.append("Set-Cookie", `guest_session=${guestId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }

  // Auto-sync user email in settings if logged in
  if (isLoggedIn && email) {
    try {
      await db.prepare(
        `INSERT INTO user_settings (user_id, email) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET email = excluded.email`
      ).bind(userId, email).run();
    } catch (e) {
      console.error("Failed to sync user email in settings:", e);
    }
  }

  let lists: any[] = [];
  const activeListId = params.id;
  let activeListExists = false;

  if (isLoggedIn) {
    // Load lists from D1 for logged-in user
    try {
      const { results: listRows } = await db.prepare("SELECT * FROM lists WHERE owner_id = ? ORDER BY created_at ASC").bind(userId).all();
      lists = listRows || [];
    } catch (e) {
      console.error("Failed to load lists:", e);
    }

    activeListExists = lists.some((l: any) => l.id === activeListId);

    if (!activeListExists && activeListId) {
      try {
        const sharedList = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(activeListId).first<any>();
        if (sharedList && sharedList.share_mode && sharedList.share_mode !== "private") {
          lists.push(sharedList);
          activeListExists = true;
        }
      } catch (e) {
        console.error("Failed to query shared list:", e);
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
        const sharedList = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(activeListId).first<any>();
        if (sharedList && sharedList.share_mode && sharedList.share_mode !== "private") {
          lists.push(sharedList);
          activeListExists = true;
        }
      } catch (e) {
        console.error("Failed to query shared list for guest:", e);
      }
    }
  }

  // Load all todos for any lists loaded from D1 (logged in user or shared list)
  let allTodos: any[] = [];
  const listIds = lists.map((l: any) => l.id);
  if (listIds.length > 0) {
    try {
      const placeholders = listIds.map(() => "?").join(",");
      const { results } = await db.prepare(`
        SELECT * FROM todos WHERE list_id IN (${placeholders})
      `).bind(...listIds).all();
      allTodos = results || [];
    } catch (e) {
      console.error("Failed to query todos:", e);
    }
  }

  const listsWithTodos = lists.map((list: any) => {
    const listTodos = allTodos
      .filter((t: any) => t.list_id === list.id)
      .map((t: any) => ({
        id: t.id,
        text: t.text,
        completed: Boolean(t.completed),
        createdAt: Number(t.created_at),
        priority: (t.priority || "none") as "low" | "medium" | "high" | "none",
        reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
        reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
        parentId: t.parent_id || undefined,
        recurrence: (t.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
      }))
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
    return {
      ...list,
      todos: listTodos,
    };
  });

  const activeList = listsWithTodos.find((l: any) => l.id === activeListId);
  const todos = activeList ? activeList.todos : [];

  const totalLists = listsWithTodos.length;
  let totalTasks = 0;
  let completedTasks = 0;
  for (const item of listsWithTodos) {
    totalTasks += item.todos.length;
    completedTasks += item.todos.filter((t: any) => t.completed).length;
  }

  // Load settings
  let settings = {
    emailEnabled: false,
    smsEnabled: false,
    phoneNumber: "",
    phoneCarrier: "",
    discordWebhookUrl: ""
  };
  if (userId && isLoggedIn) {
    try {
      const settingsVal = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).first<any>();
      if (settingsVal) {
        settings = {
          emailEnabled: Boolean(settingsVal.email_enabled),
          smsEnabled: Boolean(settingsVal.sms_enabled),
          phoneNumber: settingsVal.phone_number || "",
          phoneCarrier: settingsVal.phone_carrier || "",
          discordWebhookUrl: settingsVal.discord_webhook_url || ""
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
    stats: {
      totalLists,
      totalTasks,
      completedTasks
    }
  };

  if (isNewGuest && guestId) {
    return json(responsePayload, { headers });
  }

  return json(responsePayload);
};

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { userId, email, isLoggedIn } = await getOptionalUser(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const activeListId = params.id as string;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "migrateGuestLists") {
    if (isLoggedIn) {
      const rawLists = formData.get("guestLists") as string;
      if (rawLists) {
        try {
          const guestLists = JSON.parse(rawLists);
          for (const gList of guestLists) {
            const listName = (gList.name || "My Tasks").trim();
            const todos = Array.isArray(gList.todos) ? gList.todos : [];
            if (listName === "My Tasks" && todos.length === 0) {
              continue;
            }

            const newListId = crypto.randomUUID();
            await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, NULL)")
              .bind(newListId, listName, userId, gList.created_at || Date.now())
              .run();
            
            for (const todo of todos) {
              const todoId = crypto.randomUUID();
              await db.prepare(
                "INSERT INTO todos (id, list_id, text, completed, created_at, priority, reminder_at, reminder_sent, parent_id, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
              ).bind(
                todoId,
                newListId,
                todo.text,
                todo.completed ? 1 : 0,
                todo.createdAt || Date.now(),
                todo.priority && todo.priority !== "none" ? todo.priority : null,
                todo.reminderAt ?? null,
                todo.reminderSent ? 1 : (todo.reminderAt ? 0 : null),
                todo.parentId ?? null,
                todo.recurrence || "none"
              ).run();
            }
          }
        } catch (e) {
          console.error("Failed to migrate guest lists to D1:", e);
        }
      }
    }
    return json({ success: true });
  }

  if (intent === "updateSettings") {
    if (!isLoggedIn) {
      return Response.json({ error: "Sign in required to configure notification settings" }, { status: 401 });
    }

    const emailEnabled = formData.get("emailEnabled") === "true";
    const smsEnabled = formData.get("smsEnabled") === "true";
    const phoneNumber = (formData.get("phoneNumber") as string) || "";
    const phoneCarrier = (formData.get("phoneCarrier") as string) || "";
    const discordWebhookUrlRaw = (formData.get("discordWebhookUrl") as string) || "";
    const discordWebhookUrl = discordWebhookUrlRaw.trim();

    if (discordWebhookUrl) {
      const DISCORD_WEBHOOK_REGEX = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;
      if (!DISCORD_WEBHOOK_REGEX.test(discordWebhookUrl)) {
        return Response.json({ error: "Invalid Discord Webhook URL format" }, { status: 400 });
      }
    }

    try {
      await db.prepare(
        `INSERT INTO user_settings (user_id, email, email_enabled, sms_enabled, phone_number, phone_carrier, discord_webhook_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           email = excluded.email,
           email_enabled = excluded.email_enabled,
           sms_enabled = excluded.sms_enabled,
           phone_number = excluded.phone_number,
           phone_carrier = excluded.phone_carrier,
           discord_webhook_url = excluded.discord_webhook_url`
      ).bind(
        userId,
        email || "",
        emailEnabled ? 1 : 0,
        smsEnabled ? 1 : 0,
        phoneNumber.trim(),
        phoneCarrier.trim(),
        discordWebhookUrl
      ).run();
    } catch (e) {
      console.error("Failed to update settings in database:", e);
    }

    return json({ success: true });
  }

  // Check list ownership or collaborative access in D1
  let hasOwnership = false;
  let isCollaborative = false;
  if (activeListId) {
    try {
      const listRow = await db.prepare("SELECT owner_id, share_mode FROM lists WHERE id = ?").bind(activeListId).first<any>();
      if (listRow) {
        hasOwnership = listRow.owner_id === userId;
        isCollaborative = listRow.share_mode === "public_edit";
      }
    } catch (e) {
      console.error("Failed to verify list access:", e);
    }
  }

  // For guest users operating on guest lists (not shared D1 lists), return success without D1 mutation
  if (!isLoggedIn && !isCollaborative) {
    return json({ success: true, guestLocalStorage: true });
  }

  // For non-list creation actions, verify ownership or collaborative access of the active list
  if (intent !== "createList" && !hasOwnership && !isCollaborative) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }

  const todoManager = new TodoManager(db, activeListId);

  switch (intent) {
    case "create": {
      const text = formData.get("text");
      const priority =
        (formData.get("priority") as "low" | "medium" | "high" | "none") || "none";
      const reminderAtVal = formData.get("reminderAt");
      const reminderAt = reminderAtVal ? Number(reminderAtVal) : undefined;
      const parentId = (formData.get("parentId") as string) || undefined;
      const recurrence = (formData.get("recurrence") as "none" | "daily" | "weekly" | "monthly") || "none";
      const durationMinutesVal = formData.get("durationMinutes");
      const durationMinutes = durationMinutesVal ? Number(durationMinutesVal) : 15;
      
      if (typeof text !== "string" || !text)
        return Response.json({ error: "Invalid text" }, { status: 400 });
      
      await todoManager.create(text, priority, reminderAt, parentId, recurrence, durationMinutes);
      return { success: true };
    }

    case "toggle": {
      const id = formData.get("id") as string;
      await todoManager.toggle(id);
      return { success: true };
    }

    case "delete": {
      const id = formData.get("id") as string;
      await todoManager.delete(id);
      return { success: true };
    }

    case "updatePriority": {
      const id = formData.get("id") as string;
      const priority = formData.get("priority") as "low" | "medium" | "high" | "none";
      await todoManager.updatePriority(id, priority);
      return { success: true };
    }

    case "updateText": {
      const id = formData.get("id") as string;
      const text = formData.get("text") as string;
      if (typeof text !== "string" || !text.trim()) {
        return Response.json({ error: "Invalid text" }, { status: 400 });
      }
      await todoManager.updateText(id, text.trim());
      return { success: true };
    }

    case "updateReminder": {
      const id = formData.get("id") as string;
      const reminderAtVal = formData.get("reminderAt");
      const reminderAt = reminderAtVal ? Number(reminderAtVal) : undefined;
      await todoManager.updateReminder(id, reminderAt);
      return { success: true };
    }

    case "markReminderSent": {
      const id = formData.get("id") as string;
      await todoManager.markReminderSent(id);
      return { success: true };
    }

    case "updateRecurrence": {
      const id = formData.get("id") as string;
      const recurrence = formData.get("recurrence") as "none" | "daily" | "weekly" | "monthly";
      await todoManager.updateRecurrence(id, recurrence);
      return { success: true };
    }

    case "updateShareMode": {
      const listId = formData.get("listId") as string;
      const shareMode = formData.get("shareMode") as string;
      if (shareMode !== "private" && shareMode !== "public_read" && shareMode !== "public_edit") {
        return Response.json({ error: "Invalid share mode" }, { status: 400 });
      }
      const ownRow = await db.prepare("SELECT 1 FROM lists WHERE id = ? AND owner_id = ?").bind(listId, userId).first();
      if (!ownRow) {
        return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
      }
      await db.prepare("UPDATE lists SET share_mode = ? WHERE id = ?").bind(shareMode, listId).run();
      return { success: true };
    }

    case "clearCompleted": {
      await todoManager.clearCompleted();
      return { success: true };
    }

    case "createList": {
      const listName = formData.get("listName");
      const category = (formData.get("category") as string) || "Checklist";
      if (typeof listName !== "string" || !listName.trim()) {
        return Response.json({ error: "Invalid list name" }, { status: 400 });
      }
      const newListId = crypto.randomUUID();
      try {
        await db.prepare("ALTER TABLE lists ADD COLUMN category TEXT DEFAULT 'Checklist'").run().catch(() => {});
        await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl, category) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(newListId, listName.trim(), userId, Date.now(), isLoggedIn ? null : 86400, category)
          .run();
      } catch (e) {
        console.error("Failed to create list:", e);
      }
      return redirect(`/${newListId}`);
    }

    case "renameList": {
      const listId = formData.get("listId") as string;
      const newName = formData.get("newName") as string;
      if (typeof newName !== "string" || !newName.trim()) {
        return Response.json({ error: "Invalid list name" }, { status: 400 });
      }
      const ownRow = await db.prepare("SELECT 1 FROM lists WHERE id = ? AND owner_id = ?").bind(listId, userId).first();
      if (!ownRow) {
        return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
      }
      try {
        await db.prepare("UPDATE lists SET name = ? WHERE id = ?").bind(newName.trim(), listId).run();
      } catch (e) {
        console.error("Failed to rename list:", e);
      }
      return { success: true };
    }

    case "updateListCategory": {
      const listId = formData.get("listId") as string;
      const category = formData.get("category") as string;
      if (!category) {
        return Response.json({ error: "Invalid category" }, { status: 400 });
      }
      const ownRow = await db.prepare("SELECT 1 FROM lists WHERE id = ? AND owner_id = ?").bind(listId, userId).first();
      if (!ownRow) {
        return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
      }
      try {
        await db.prepare("ALTER TABLE lists ADD COLUMN category TEXT DEFAULT 'Checklist'").run().catch(() => {});
        await db.prepare("UPDATE lists SET category = ? WHERE id = ?").bind(category, listId).run();
      } catch (e) {
        console.error("Failed to update list category:", e);
      }
      return { success: true };
    }

    case "deleteList": {
      const listId = formData.get("listId") as string;
      const ownRow = await db.prepare("SELECT 1 FROM lists WHERE id = ? AND owner_id = ?").bind(listId, userId).first();
      if (!ownRow) {
        return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
      }
      try {
        await db.prepare("DELETE FROM lists WHERE id = ?").bind(listId).run();
      } catch (e) {
        console.error("Failed to delete list:", e);
      }

      if (activeListId === listId) {
        try {
          const firstList = await db.prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1").bind(userId).first<any>();
          if (firstList) {
            return redirect(`/${firstList.id}`);
          } else {
            return redirect("/");
          }
        } catch (e) {
          console.error("Failed to find fallback list:", e);
          return redirect("/");
        }
      }
      return { success: true };
    }

    default:
      return Response.json({ error: "Invalid intent" }, { status: 400 });
  }
}

type Filter = "all" | "active" | "completed";

const priorityConfig = {
  high: {
    label: "High",
    color: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    ring: "ring-rose-500/40",
    dot: "bg-rose-400",
  },
  medium: {
    label: "Med",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    ring: "ring-amber-500/40",
    dot: "bg-amber-400",
  },
  low: {
    label: "Low",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/40",
    dot: "bg-emerald-400",
  },
  none: {
    label: "None",
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    ring: "ring-slate-500/30",
    dot: "bg-slate-400",
  },
};

function formatReminder(reminderAt?: number, reminderSent?: boolean) {
  if (!reminderAt) return null;
  if (reminderSent) return "Sent";
  
  const diffMs = reminderAt - Date.now();
  if (diffMs <= 0) return "Due";
  
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "<1m";
  if (diffMin < 60) return `${diffMin}m`;
  
  const date = new Date(reminderAt);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return timeStr;
  }
  
  return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
}

async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

function ReminderPicker({ todo }: { todo: Todo }) {
  const { isLoggedIn, onGuestAction } = useContext(GuestContext);
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const optimisticReminderAt = fetcher.formData?.get("intent") === "updateReminder"
    ? (fetcher.formData.get("reminderAt") ? Number(fetcher.formData.get("reminderAt")) : undefined)
    : todo.reminderAt;

  const optimisticReminderSent = fetcher.formData?.get("intent") === "updateReminder"
    ? false
    : todo.reminderSent;

  const displayText = formatReminder(optimisticReminderAt, optimisticReminderSent);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleRequestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const setDuration = async (minutes: number) => {
    await handleRequestPermission();
    const timeMs = Date.now() + minutes * 60 * 1000;
    if (!isLoggedIn) {
      onGuestAction("updateReminder", { id: todo.id, reminderAt: timeMs });
    }
    fetcher.submit(
      {
        intent: "updateReminder",
        id: todo.id,
        reminderAt: timeMs.toString(),
      },
      { method: "post" }
    );
    setOpen(false);
  };

  const clearReminder = () => {
    if (!isLoggedIn) {
      onGuestAction("updateReminder", { id: todo.id, reminderAt: undefined });
    }
    fetcher.submit(
      {
        intent: "updateReminder",
        id: todo.id,
        reminderAt: "",
      },
      { method: "post" }
    );
    setOpen(false);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTime) return;
    await handleRequestPermission();
    const timeMs = new Date(customTime).getTime();
    if (!isLoggedIn) {
      onGuestAction("updateReminder", { id: todo.id, reminderAt: timeMs });
    }
    fetcher.submit(
      {
        intent: "updateReminder",
        id: todo.id,
        reminderAt: timeMs.toString(),
      },
      { method: "post" }
    );
    setOpen(false);
    setCustomOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-semibold flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all duration-200 cursor-pointer
          ${displayText
            ? optimisticReminderSent
              ? "bg-slate-800/80 border-slate-700/60 text-slate-400"
              : "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:ring-2 hover:ring-indigo-500/40"
            : "bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
          }`}
        title={displayText ? `Reminder: ${displayText}` : "Set reminder"}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {displayText && <span className="max-w-[5.5rem] truncate">{displayText}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px] flex flex-col">
          <span className="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider select-none">Set Reminder</span>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.04] transition-colors"
            onClick={() => setDuration(1)}
          >
            ⏱ In 1 min
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.04] transition-colors"
            onClick={() => setDuration(5)}
          >
            ⏱ In 5 mins
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.04] transition-colors"
            onClick={() => setDuration(15)}
          >
            ⏱ In 15 mins
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.04] transition-colors"
            onClick={() => setDuration(30)}
          >
            ⏱ In 30 mins
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.04] transition-colors border-b border-white/5"
            onClick={() => setDuration(60)}
          >
            ⏱ In 1 hour
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-white/[0.04] transition-colors"
            onClick={() => setCustomOpen(true)}
          >
            📅 Specific Time...
          </button>
          {displayText && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors border-t border-white/5"
              onClick={clearReminder}
            >
              ❌ Clear Reminder
            </button>
          )}
        </div>
      )}

      {customOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-3 min-w-[200px]">
          <form onSubmit={handleCustomSubmit} className="flex flex-col gap-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Choose date & time</span>
            <input
              type="datetime-local"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              required
              className="w-full rounded-lg bg-slate-950 border border-white/[0.08] text-slate-300 text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <div className="flex gap-1.5 justify-end mt-1">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 text-[10px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md"
              >
                Set
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-4 select-none flex-1">
      <svg
        className="w-20 h-20 sm:w-28 sm:h-28 mb-4 opacity-40 text-indigo-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
      </svg>
      <h3
        className="text-lg font-semibold text-slate-300 mb-1"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        No tasks in this list
      </h3>
      <p className="text-slate-500 text-xs text-center max-w-xs">
        Add your first task above to get started. Stay organized and productive!
      </p>
    </div>
  );
}

function ProgressRing({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          className="stroke-slate-800/80"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          className="stroke-indigo-500"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-indigo-300">
        {pct}%
      </span>
    </div>
  );
}

function Toast({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-2xl transition-all duration-300 border
        bg-slate-900/95 backdrop-blur-lg text-indigo-200 border-indigo-500/30
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
    >
      {message}
    </div>
  );
}

function PriorityPicker({
  currentPriority,
  todoId,
}: {
  currentPriority: "low" | "medium" | "high" | "none";
  todoId: string;
}) {
  const { isLoggedIn, onGuestAction } = useContext(GuestContext);
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const optimisticPriority =
    fetcher.formData?.get("priority") as "low" | "medium" | "high" | "none" | null;
  const displayPriority = optimisticPriority || currentPriority;
  const cfg = priorityConfig[displayPriority];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border transition-all duration-200 cursor-pointer
          ${cfg.bg} ${cfg.color} ${cfg.border} hover:ring-2 ${cfg.ring}`}
      >
        {cfg.label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-1 min-w-[90px]">
          {(["high", "medium", "low", "none"] as const).map((p) => {
            const c = priorityConfig[p];
            return (
              <button
                key={p}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors hover:bg-white/[0.04] ${c.color}`}
                onClick={() => {
                  if (!isLoggedIn) {
                    onGuestAction("updatePriority", { id: todoId, priority: p });
                  }
                  fetcher.submit(
                    { intent: "updatePriority", id: todoId, priority: p },
                    { method: "post" },
                  );
                  setOpen(false);
                }}
              >
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecurrencePicker({
  currentRecurrence,
  todoId,
}: {
  currentRecurrence: "none" | "daily" | "weekly" | "monthly";
  todoId: string;
}) {
  const { isLoggedIn, onGuestAction } = useContext(GuestContext);
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const optimisticRecurrence =
    fetcher.formData?.get("recurrence") as "none" | "daily" | "weekly" | "monthly" | null;
  const displayRecurrence = optimisticRecurrence || currentRecurrence;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const recurrenceConfig = {
    none: { label: "None", emoji: "⚪" },
    daily: { label: "Daily", emoji: "🔄" },
    weekly: { label: "Weekly", emoji: "🔄" },
    monthly: { label: "Monthly", emoji: "🔄" },
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-all duration-200 cursor-pointer
          ${displayRecurrence !== "none"
            ? "bg-violet-500/15 border-violet-500/30 text-violet-300 hover:ring-2 hover:ring-violet-500/40"
            : "bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
          }`}
        title="Repeat Settings"
      >
        <span>🔁</span>
        {displayRecurrence !== "none" && <span className="capitalize">{displayRecurrence}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-45 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-1 min-w-[100px] flex flex-col">
          <span className="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider select-none">Repeat</span>
          {(["none", "daily", "weekly", "monthly"] as const).map((r) => {
            const conf = recurrenceConfig[r];
            return (
              <button
                key={r}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors hover:bg-white/[0.04] text-slate-300"
                onClick={() => {
                  if (!isLoggedIn) {
                    onGuestAction("updateRecurrence", { id: todoId, recurrence: r });
                  }
                  fetcher.submit(
                    { intent: "updateRecurrence", id: todoId, recurrence: r },
                    { method: "post" },
                  );
                  setOpen(false);
                }}
              >
                <span>{conf.emoji}</span>
                <span className="capitalize">{conf.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TodoItem({ todo, subtasks = [], isSubtask = false, canEdit = true }: { todo: Todo; subtasks?: Todo[]; isSubtask?: boolean; canEdit?: boolean }) {
  const { isLoggedIn, onGuestAction } = useContext(GuestContext);
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const subtaskFetcher = useFetcher();
  const editFetcher = useFetcher();

  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isToggling = toggleFetcher.formData?.get("intent") === "toggle";
  const isDeleting = deleteFetcher.formData?.get("intent") === "delete";
  const optimisticCompleted = isToggling ? !todo.completed : todo.completed;

  useEffect(() => {
    if (showAddSubtask && subtaskInputRef.current) {
      subtaskInputRef.current.focus();
    }
  }, [showAddSubtask]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditText(todo.text);
  }, [todo.text]);

  if (isDeleting) return null;

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtaskText.trim() || !canEdit) return;
    if (!isLoggedIn) {
      onGuestAction("create", { text: subtaskText.trim(), parentId: todo.id, priority: "none" });
    }
    subtaskFetcher.submit(
      {
        intent: "create",
        text: subtaskText.trim(),
        parentId: todo.id,
        priority: "none",
      },
      { method: "post" }
    );
    setSubtaskText("");
    setShowAddSubtask(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim() || !canEdit) return;
    if (editText.trim() === todo.text) {
      setIsEditing(false);
      return;
    }
    if (!isLoggedIn) {
      onGuestAction("updateText", { id: todo.id, text: editText.trim() });
    }
    editFetcher.submit(
      {
        intent: "updateText",
        id: todo.id,
        text: editText.trim(),
      },
      { method: "post" }
    );
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditText(todo.text);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <li
        className={`group flex items-center gap-2 sm:gap-3 border transition-all duration-300 min-w-0 overflow-hidden
          ${isSubtask 
            ? "bg-transparent border-transparent py-1.5 px-2 hover:bg-white/[0.02] rounded-lg" 
            : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.04] p-3.5 rounded-xl shadow-sm"
          }
          ${optimisticCompleted ? "opacity-60" : "opacity-100"}`}
      >
        <toggleFetcher.Form
          method="post"
          className="flex-shrink-0"
          onSubmit={() => {
            if (!canEdit) return;
            if (!isLoggedIn) {
              onGuestAction("toggle", { id: todo.id });
            }
          }}
        >
          <input type="hidden" name="id" value={todo.id} />
          <input type="hidden" name="intent" value="toggle" />
          <button
            type="submit"
            disabled={!canEdit}
            className={`rounded-md border-2 flex items-center justify-center transition-all duration-200 ${canEdit ? "cursor-pointer" : "cursor-default opacity-80"}
              ${isSubtask ? "w-4 h-4 border-slate-700" : "w-5 h-5 border-slate-700"}
              ${canEdit ? "hover:border-themeAccentFrom" : ""}
              data-[checked=true]:bg-themeAccentFrom data-[checked=true]:border-themeAccentFrom`}
            data-checked={optimisticCompleted}
          >
            {optimisticCompleted && (
              <svg
                className={`text-white animate-scale-up ${isSubtask ? "w-2.5 h-2.5" : "w-3 h-3"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </button>
        </toggleFetcher.Form>

        {isEditing && canEdit ? (
          <form onSubmit={handleEditSubmit} className="flex-1 flex items-center gap-2">
            <input
              ref={editInputRef}
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`w-full rounded-md bg-white/[0.04] border border-white/[0.1] text-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 ${
                isSubtask ? "text-xs" : "text-sm"
              }`}
            />
            <button
              type="submit"
              className="text-[10px] bg-themeAccentFrom hover:bg-themeAccentTo text-white px-2 py-1 rounded font-semibold cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditText(todo.text);
                setIsEditing(false);
              }}
              className="text-[10px] text-slate-500 hover:text-slate-350 px-1 py-1 cursor-pointer"
            >
              Cancel
            </button>
          </form>
        ) : (
          <span
            className={`flex-1 min-w-0 truncate transition-all duration-200 ${canEdit ? "cursor-pointer hover:text-white" : "cursor-default"} ${
              isSubtask ? "text-xs text-slate-350" : "text-sm text-slate-200"
            } ${
              optimisticCompleted
                ? "line-through text-slate-500 italic opacity-50"
                : ""
            }`}
            title={todo.text}
            onDoubleClick={() => {
              if (!optimisticCompleted && canEdit) {
                setIsEditing(true);
              }
            }}
          >
            {todo.text}
          </span>
        )}

        {/* Duration Badge */}
        {todo.durationMinutes ? (
          <span className="text-[10px] bg-white/[0.04] text-slate-400 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 border border-white/[0.06]">
            ⏱ {todo.durationMinutes}m
          </span>
        ) : null}

        {/* Recurrence Indicator (for parent tasks only) */}
        {!isSubtask && todo.recurrence && todo.recurrence !== "none" && (
          <span className="text-[9px] bg-themeAccentBg text-themeAccentText px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 border border-themeAccentText/20">
            🔄 {todo.recurrence}
          </span>
        )}

        {canEdit && <PriorityPicker currentPriority={todo.priority || "none"} todoId={todo.id} />}
        {canEdit && !optimisticCompleted && !isSubtask && <ReminderPicker todo={todo} />}

        {/* Recurrence Picker dropdown (only for parent tasks) */}
        {canEdit && !isSubtask && !optimisticCompleted && (
          <RecurrencePicker currentRecurrence={todo.recurrence || "none"} todoId={todo.id} />
        )}

        {/* Add Subtask Button (only for parent tasks) */}
        {canEdit && !isSubtask && !optimisticCompleted && (
          <button
            type="button"
            onClick={() => setShowAddSubtask(!showAddSubtask)}
            className="text-slate-500 hover:text-themeAccentText p-1 rounded-lg hover:bg-white/[0.04] transition-all cursor-pointer"
            title="Add Subtask"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}

        {canEdit && !optimisticCompleted && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-themeAccentText transition-all duration-200 p-1 rounded-lg hover:bg-white/[0.04] cursor-pointer"
            title="Edit task"
            aria-label="Edit task"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}

        {canEdit && (
          <deleteFetcher.Form
            method="post"
            onSubmit={() => {
              if (!isLoggedIn) {
                onGuestAction("delete", { id: todo.id });
              }
            }}
          >
            <input type="hidden" name="id" value={todo.id} />
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all duration-200 p-1 rounded-lg hover:bg-rose-500/10 cursor-pointer"
              aria-label="Delete task"
            >
              <svg
                className="w-4 h-4"
                fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          </deleteFetcher.Form>
        )}
      </li>

      {/* Render subtasks underneath the parent */}
      {!isSubtask && (
        <div className="pl-6 mt-1 flex flex-col gap-1 border-l border-white/[0.04] ml-5">
          {subtasks.map((sub) => (
            <TodoItem key={sub.id} todo={sub} isSubtask={true} canEdit={canEdit} />
          ))}

          {/* Inline Add Subtask Input Form */}
          {showAddSubtask && (
            <form onSubmit={handleAddSubtask} className="flex items-center gap-2 py-1 px-2">
              <input
                ref={subtaskInputRef}
                type="text"
                value={subtaskText}
                onChange={(e) => setSubtaskText(e.target.value)}
                placeholder="New subtask name..."
                required
                className="flex-1 text-xs rounded-lg bg-white/[0.03] border border-white/[0.08] text-slate-200 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
              />
              <button
                type="submit"
                className="bg-themeAccentFrom hover:bg-themeAccentTo text-white rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddSubtask(false)}
                className="text-slate-500 hover:text-slate-350 text-xs px-2"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function TodoPage() {
  const { userId, email, isLoggedIn, settings, lists: serverLists, activeListId, todos: serverTodos, stats } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const createFetcher = useFetcher();
  const clearFetcher = useFetcher();
  const listFetcher = useFetcher();
  const settingsFetcher = useFetcher();
  
  const [guestLists, setGuestLists] = useState<GuestList[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLoggedIn) {
      const loaded = loadGuestListsFromStorage(userId);
      setGuestLists(loaded);
    } else {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validLists = parsed.filter((gList: any) => {
              const listName = (gList.name || "My Tasks").trim();
              const hasTodos = Array.isArray(gList.todos) && gList.todos.length > 0;
              if (listName === "My Tasks" && !hasTodos) {
                return false;
              }
              return true;
            });
            if (validLists.length > 0) {
              const form = new FormData();
              form.append("intent", "migrateGuestLists");
              form.append("guestLists", JSON.stringify(validLists));
              listFetcher.submit(form, { method: "post" });
            }
            localStorage.removeItem(GUEST_STORAGE_KEY);
          }
        } catch (e) {
          console.error("Failed to migrate guest lists:", e);
        }
      }
    }
  }, [isLoggedIn, userId]);

  const isSharedServerList = serverLists.some((l: any) => l.id === activeListId && l.owner_id !== userId);
  const lists = isLoggedIn || isSharedServerList ? serverLists : guestLists;
  const activeListMeta = lists.find((l: any) => l.id === activeListId) || lists[0];
  const effectiveActiveListId = activeListMeta ? activeListMeta.id : activeListId;
  const todos: Todo[] = activeListMeta ? activeListMeta.todos || [] : [];

  const handleGuestAction = useCallback((intent: string, payload: any) => {
    if (isLoggedIn || isSharedServerList) return;
    setGuestLists((prevLists) => {
      let targetListId = payload.listId || effectiveActiveListId;
      let targetList = prevLists.find((l) => l.id === targetListId);
      if (!targetList && prevLists.length > 0) {
        targetList = prevLists[0];
        targetListId = targetList.id;
      }

      let updatedLists = [...prevLists];

      switch (intent) {
        case "create": {
          const newTodo: Todo = {
            id: crypto.randomUUID(),
            text: payload.text,
            completed: false,
            createdAt: Date.now(),
            priority: payload.priority || "none",
            reminderAt: payload.reminderAt ? Number(payload.reminderAt) : undefined,
            reminderSent: payload.reminderAt ? false : undefined,
            parentId: payload.parentId || undefined,
            recurrence: payload.recurrence || "none",
          };
          if (prevLists.length === 0) {
            const defaultList: GuestList = {
              id: targetListId || userId || "guest_default",
              name: "My Tasks",
              owner_id: userId,
              created_at: Date.now(),
              share_mode: "private",
              todos: [newTodo],
            };
            updatedLists = [defaultList];
          } else {
            updatedLists = prevLists.map((l) =>
              l.id === targetListId ? { ...l, todos: [newTodo, ...l.todos] } : l
            );
          }
          break;
        }
        case "toggle": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            const updatedTodos = l.todos.map((t) => {
              if (t.id !== payload.id) return t;
              const willBeCompleted = !t.completed;
              if (willBeCompleted && t.recurrence && t.recurrence !== "none") {
                const currentReminder = t.reminderAt || Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                let nextReminder = currentReminder;
                if (t.recurrence === "daily") nextReminder += oneDay;
                else if (t.recurrence === "weekly") nextReminder += 7 * oneDay;
                else if (t.recurrence === "monthly") {
                  const d = new Date(currentReminder);
                  d.setMonth(d.getMonth() + 1);
                  nextReminder = d.getTime();
                }
                return { ...t, completed: false, reminderAt: nextReminder, reminderSent: false };
              }
              return { ...t, completed: willBeCompleted };
            });
            return { ...l, todos: updatedTodos };
          });
          break;
        }
        case "delete": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            return {
              ...l,
              todos: l.todos.filter((t) => t.id !== payload.id && t.parentId !== payload.id),
            };
          });
          break;
        }
        case "updatePriority": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            return {
              ...l,
              todos: l.todos.map((t) => (t.id === payload.id ? { ...t, priority: payload.priority } : t)),
            };
          });
          break;
        }
        case "updateText": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            return {
              ...l,
              todos: l.todos.map((t) => (t.id === payload.id ? { ...t, text: payload.text } : t)),
            };
          });
          break;
        }
        case "updateReminder": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            return {
              ...l,
              todos: l.todos.map((t) =>
                t.id === payload.id
                  ? {
                      ...t,
                      reminderAt: payload.reminderAt ? Number(payload.reminderAt) : undefined,
                      reminderSent: payload.reminderAt ? false : undefined,
                    }
                  : t
              ),
            };
          });
          break;
        }
        case "updateRecurrence": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            return {
              ...l,
              todos: l.todos.map((t) => (t.id === payload.id ? { ...t, recurrence: payload.recurrence } : t)),
            };
          });
          break;
        }
        case "clearCompleted": {
          updatedLists = prevLists.map((l) => {
            if (l.id !== targetListId) return l;
            return { ...l, todos: l.todos.filter((t) => !t.completed) };
          });
          break;
        }
        case "createList": {
          const newList: GuestList = {
            id: payload.id || crypto.randomUUID(),
            name: payload.name,
            owner_id: userId,
            created_at: Date.now(),
            share_mode: "private",
            todos: [],
          };
          updatedLists = [...prevLists, newList];
          break;
        }
        case "renameList": {
          updatedLists = prevLists.map((l) =>
            l.id === payload.listId ? { ...l, name: payload.newName } : l
          );
          break;
        }
        case "deleteList": {
          updatedLists = prevLists.filter((l) => l.id !== payload.listId);
          break;
        }
      }

      saveGuestListsToStorage(updatedLists);
      return updatedLists;
    });
  }, [isLoggedIn, isSharedServerList, effectiveActiveListId, userId]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);
  
  const [filter, setFilter] = useState<Filter>("all");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "none">("none");
  const [toast, setToast] = useState({ message: "", visible: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  useEffect(() => {
    const savedViewMode = localStorage.getItem("synx_view_mode");
    if (savedViewMode === "list" || savedViewMode === "calendar") {
      setViewMode(savedViewMode);
    }
  }, []);

  const changeViewMode = (mode: "list" | "calendar") => {
    setViewMode(mode);
    localStorage.setItem("synx_view_mode", mode);
  };

  // UX additions: theme, search, sort, share popup
  const [theme, setTheme] = useState("midnight");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "priority" | "reminder" | "alphabetical">("created");
  const [showSharePopover, setShowSharePopover] = useState(false);
  const sharePopoverRef = useRef<HTMLDivElement>(null);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("synx_theme") || "midnight";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("synx_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sharePopoverRef.current && !sharePopoverRef.current.contains(e.target as Node)) {
        setShowSharePopover(false);
      }
    }
    if (showSharePopover) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSharePopover]);

  // Strips "+1" prefix if present to display only 10 digits in input
  const getDisplayPhone = (phone?: string) => {
    if (!phone) return "";
    const cleaned = phone.trim().replace(/\D/g, "");
    if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return cleaned.substring(1);
    }
    return cleaned;
  };

  // Notification settings modal states
  const [emailEnabled, setEmailEnabled] = useState(settings?.emailEnabled ?? false);
  const [smsEnabled, setSmsEnabled] = useState(settings?.smsEnabled ?? false);
  const [phoneInput, setPhoneInput] = useState(getDisplayPhone(settings?.phoneNumber));
  const [phoneCarrier, setPhoneCarrier] = useState(settings?.phoneCarrier ?? "");
  const [discordEnabled, setDiscordEnabled] = useState(!!settings?.discordWebhookUrl);
  const [discordInput, setDiscordInput] = useState(settings?.discordWebhookUrl ?? "");
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const initialEmailEnabled = settings?.emailEnabled ?? false;
  const initialSmsEnabled = settings?.smsEnabled ?? false;
  const initialPhoneInput = getDisplayPhone(settings?.phoneNumber);
  const initialPhoneCarrier = settings?.phoneCarrier ?? "";
  const initialDiscordEnabled = !!settings?.discordWebhookUrl;
  const initialDiscordInput = settings?.discordWebhookUrl ?? "";

  const isSettingsDirty =
    emailEnabled !== initialEmailEnabled ||
    smsEnabled !== initialSmsEnabled ||
    phoneInput !== initialPhoneInput ||
    phoneCarrier !== initialPhoneCarrier ||
    discordEnabled !== initialDiscordEnabled ||
    discordInput !== initialDiscordInput;

  const resetSettings = () => {
    setEmailEnabled(initialEmailEnabled);
    setSmsEnabled(initialSmsEnabled);
    setPhoneInput(initialPhoneInput);
    setPhoneCarrier(initialPhoneCarrier);
    setDiscordEnabled(initialDiscordEnabled);
    setDiscordInput(initialDiscordInput);
  };

  const handleSaveSettings = () => {
    const cleanPhone = phoneInput.replace(/\D/g, "");
    if (smsEnabled && cleanPhone.length !== 10) {
      showToast("⚠️ Phone number must be exactly 10 digits!");
      return false;
    }
    settingsFetcher.submit({
      intent: "updateSettings",
      emailEnabled: emailEnabled ? "true" : "false",
      smsEnabled: smsEnabled ? "true" : "false",
      phoneNumber: smsEnabled ? `+1${cleanPhone}` : "",
      phoneCarrier: smsEnabled ? phoneCarrier : "",
      discordWebhookUrl: discordEnabled ? discordInput : "",
    }, { method: "post" });
    showToast("✓ Saved Preferences!");
    return true;
  };

  const requestCloseProfile = () => {
    if (isSettingsDirty) {
      setShowUnsavedPrompt(true);
    } else {
      setIsProfileOpen(false);
    }
  };

  useEffect(() => {
    if (!isProfileOpen || !isSettingsDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isProfileOpen, isSettingsDirty]);

  useEffect(() => {
    setEmailEnabled(settings?.emailEnabled ?? false);
    setSmsEnabled(settings?.smsEnabled ?? false);
    setPhoneInput(getDisplayPhone(settings?.phoneNumber));
    setPhoneCarrier(settings?.phoneCarrier ?? "");
    setDiscordEnabled(!!settings?.discordWebhookUrl);
    setDiscordInput(settings?.discordWebhookUrl ?? "");
  }, [settings]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("Notification" in window) {
        setBrowserNotificationPermission(Notification.permission);
      } else {
        setBrowserNotificationPermission("unsupported");
      }
    }
  }, [isProfileOpen]);

  // Reminder States for Creation Form
  const [reminderMode, setReminderMode] = useState<"none" | "duration" | "specific">("none");
  const [reminderDuration, setReminderDuration] = useState<number>(5);
  const [reminderDateTime, setReminderDateTime] = useState<string>("");
  const [showReminderPanel, setShowReminderPanel] = useState(false);

  // Web Notification loop
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const checkReminders = () => {
      const now = Date.now();

      const notifiedStr = sessionStorage.getItem("synx_notified_ids") || "[]";
      const notifiedSet = new Set<string>(JSON.parse(notifiedStr));

      lists.forEach((list: any) => {
        const listTitle = (list.name && String(list.name).trim()) || "Reminder";
        ((list.todos || []) as Todo[]).forEach((todo) => {
          if (
            !todo.completed &&
            todo.reminderAt &&
            !todo.reminderSent &&
            todo.reminderAt <= now &&
            !notifiedSet.has(todo.id)
          ) {
            notifiedSet.add(todo.id);
            sessionStorage.setItem("synx_notified_ids", JSON.stringify(Array.from(notifiedSet)));

            if (Notification.permission === "granted") {
              try {
                const notification = new Notification(listTitle, {
                  body: todo.text,
                  icon: "/favicon.ico",
                  tag: todo.id,
                });
                notification.onclick = () => {
                  window.focus();
                };
              } catch (err) {
                console.error("Failed to trigger Notification API:", err);
              }
            }
          }
        });
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [lists]);
  
  // Custom modals state
  const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null);
  const [listToRename, setListToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListInput, setNewListInput] = useState("");
  const [newListCategory, setNewListCategory] = useState("Checklist");
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  const [listToEditCategory, setListToEditCategory] = useState<{ id: string; name: string; category?: string } | null>(null);
  const [editCategorySelection, setEditCategorySelection] = useState("Checklist");
  const [editCustomCategoryInput, setEditCustomCategoryInput] = useState("");

  const [newDurationMinutes, setNewDurationMinutes] = useState<number | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState<boolean>(false);

  // Handle escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showUnsavedPrompt) {
          setShowUnsavedPrompt(false);
        } else if (isProfileOpen) {
          requestCloseProfile();
        } else {
          setListToRename(null);
          setListToDelete(null);
          setIsCreateListOpen(false);
          setListToEditCategory(null);
        }
      }
    };
    const isAnyModalOpen = isProfileOpen || !!listToRename || !!listToDelete || isCreateListOpen || !!listToEditCategory || showUnsavedPrompt;
    if (isAnyModalOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileOpen, listToRename, listToDelete, isCreateListOpen, listToEditCategory, showUnsavedPrompt, isSettingsDirty]);

  // Inline List Title Edit State (Main Panel Header)
  const activeListName = activeListMeta?.name || "My Tasks";
  const activeListShareMode = activeListMeta?.share_mode || "private";
  const isOwner = activeListMeta ? activeListMeta.owner_id === userId : false;
  const canEdit = isOwner || activeListShareMode === "public_edit" || !activeListMeta;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(activeListName);

  useEffect(() => {
    setTitleInput(activeListName);
  }, [activeListName]);

  // Sync to-do create fetcher
  const isCreating = createFetcher.state !== "idle";
  const prevIsCreating = useRef(isCreating);
  useEffect(() => {
    if (prevIsCreating.current && !isCreating) {
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
      // Reset reminder & duration states
      setReminderMode("none");
      setReminderDuration(5);
      setReminderDateTime("");
      setShowReminderPanel(false);
      setNewDurationMinutes(null);
      setShowDurationPicker(false);
    }
    prevIsCreating.current = isCreating;
  }, [isCreating]);

  // Sync new list fetcher
  const isCreatingList = listFetcher.state !== "idle" && listFetcher.formData?.get("intent") === "createList";
  const prevIsCreatingList = useRef(isCreatingList);
  useEffect(() => {
    if (prevIsCreatingList.current && !isCreatingList) {
      if (listNameInputRef.current) listNameInputRef.current.value = "";
    }
    prevIsCreatingList.current = isCreatingList;
  }, [isCreatingList]);

  // WebMCP — register tools so AI agents can interact with sYnX in-browser
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = window.navigator as any;
    if (!nav?.modelContext?.registerTool) return;

    const controller = new AbortController();
    const { signal } = controller;

    // Tool: add a new task to the active list
    nav.modelContext.registerTool(
      {
        name: "synx_add_task",
        description: "Add a new task to the user's active sYnX task list.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text of the task to create." },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Priority level of the task. Defaults to medium.",
            },
          },
          required: ["text"],
        },
        execute: async ({ text, priority }: { text: string; priority?: string }) => {
          const form = new FormData();
          form.append("text", text);
          form.append("priority", priority ?? "medium");
          if (activeListId) form.append("listId", activeListId);
          createFetcher.submit(form, { method: "post" });
          return { success: true, task: text };
        },
      },
      { signal }
    );

    // Tool: list all current tasks in the active list
    nav.modelContext.registerTool(
      {
        name: "synx_list_tasks",
        description: "Return the tasks in the user's current active sYnX list.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          return {
            tasks: todos.map((t: any) => ({
              id: t.id,
              text: t.text,
              completed: t.completed,
              priority: t.priority,
            })),
          };
        },
      },
      { signal }
    );

    return () => controller.abort();
  }, [activeListId, todos, createFetcher]);

  // Optimistic list update
  const optimisticTodos: Todo[] = [...todos] as Todo[];

  // 1. Filter by status (All, Active, Completed) - applies to parent tasks
  const statusFilteredTodos = optimisticTodos.filter((t) => {
    if (t.parentId) return true; // keep subtasks for rendering inside parent
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  // 2. Filter by search query
  const searchedTodos = statusFilteredTodos.filter((t) => {
    if (!searchQuery) return true;
    return t.text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Find parent IDs that have matching subtasks
  const parentIdsWithMatchingSubtasks = new Set(
    searchedTodos.filter(t => t.parentId).map(t => t.parentId)
  );

  // 3. Sort tasks
  const sortedTodos = [...searchedTodos].sort((a, b) => {
    if (sortBy === "priority") {
      const pMap = { high: 3, medium: 2, low: 1, none: 0 };
      const aVal = a.priority ? (pMap[a.priority] ?? 0) : 0;
      const bVal = b.priority ? (pMap[b.priority] ?? 0) : 0;
      return bVal - aVal;
    }
    if (sortBy === "reminder") {
      const aVal = a.reminderAt || Infinity;
      const bVal = b.reminderAt || Infinity;
      return aVal - bVal;
    }
    if (sortBy === "alphabetical") {
      return a.text.localeCompare(b.text);
    }
    return b.createdAt - a.createdAt;
  });

  // 4. Extract visible parent tasks
  const visibleParents = sortedTodos.filter((t) => {
    if (t.parentId) return false;
    if (!searchQuery) return true;
    const parentMatchesText = t.text.toLowerCase().includes(searchQuery.toLowerCase());
    const hasMatchingSub = parentIdsWithMatchingSubtasks.has(t.id);
    return parentMatchesText || hasMatchingSub;
  });

  // 5. Group subtasks by parent
  const subtasksMap = sortedTodos.reduce((acc, t) => {
    if (t.parentId) {
      if (!acc[t.parentId]) acc[t.parentId] = [];
      acc[t.parentId].push(t);
    }
    return acc;
  }, {} as Record<string, Todo[]>);

  // Sort subtasks chronologically (oldest first)
  for (const parentId in subtasksMap) {
    subtasksMap[parentId].sort((a, b) => a.createdAt - b.createdAt);
  }

  const totalCount = optimisticTodos.filter(t => !t.parentId).length;
  const completedCount = optimisticTodos.filter(t => !t.parentId && t.completed).length;
  const activeCount = totalCount - completedCount;

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2200);
  }, []);

  const copyShareLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      showToast("✓ Link copied to clipboard!");
    });
  }, [showToast]);

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lists, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `synx_backup_${userId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("✓ Exported all list data!");
  };

  const handleTitleSubmit = () => {
    if (titleInput.trim() && titleInput.trim() !== activeListName) {
      listFetcher.submit(
        { intent: "renameList", listId: activeListId, newName: titleInput.trim() } as any,
        { method: "post" }
      );
    }
    setIsEditingTitle(false);
  };

  const filterButtons: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Done" },
  ];

  // Confetti trigger
  const [showConfetti, setShowConfetti] = useState(false);
  const prevCompletedCount = useRef(completedCount);
  const prevTotalTodos = useRef(totalCount);

  useEffect(() => {
    if (
      totalCount > 0 &&
      completedCount === totalCount &&
      (prevCompletedCount.current < prevTotalTodos.current || prevCompletedCount.current !== completedCount)
    ) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
    prevCompletedCount.current = completedCount;
    prevTotalTodos.current = totalCount;
  }, [completedCount, totalCount]);

  return (
    <GuestContext.Provider value={{ isLoggedIn, onGuestAction: handleGuestAction }}>
      <div className="min-h-screen md:h-screen bg-themeBg text-slate-100 flex flex-col md:grid md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] relative overflow-x-hidden overflow-y-auto md:overflow-hidden font-sans w-full max-w-[100vw]">
      
      {/* Confetti Celebration */}
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {[...Array(60)].map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 1.5;
            const duration = 1.8 + Math.random() * 1.5;
            const size = 6 + Math.random() * 8;
            const rotation = Math.random() * 360;
            const colors = ["#f43f5e", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#06b6d4"];
            const color = colors[Math.floor(Math.random() * colors.length)];
            return (
              <div
                key={i}
                className="absolute top-0 animate-confetti-fall"
                style={{
                  left: `${left}%`,
                  animationDelay: `${delay}s`,
                  animationDuration: `${duration}s`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: color,
                  transform: `rotate(${rotation}deg)`,
                  borderRadius: i % 2 === 0 ? "50%" : "2px",
                }}
              />
            );
          })}
        </div>
      )}

      {/* ── Ambient Gradient Blobs ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-themeAccentFrom/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-themeAccentTo/10 rounded-full blur-[100px]" />
      </div>

      {/* ── Mobile Header Bar ─────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-themeSidebar border-b border-themeBorder relative z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-themeAccentFrom to-themeAccentTo flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="font-extrabold text-lg text-slate-200 tracking-tight font-display">sYnX</span>
        </div>
        <button
          onClick={() => setIsSidebarOpen((o) => !o)}
          className="text-slate-300 p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {isSidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* ── Mobile Sidebar Overlay ───────────────────────── */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden cursor-pointer"
        />
      )}

      {/* ── Sidebar Component (Desktop and Mobile drawer) ──── */}
      <aside
        className={`fixed md:sticky top-0 left-0 bottom-0 z-40 md:z-10 h-full max-h-dvh md:h-screen md:max-h-screen w-[min(280px,85vw)] md:w-full md:max-w-none md:min-w-0 bg-themeSidebar border-r border-themeBorder p-5 flex flex-col justify-between overflow-hidden transition-transform duration-300 md:transform-none shadow-2xl md:shadow-none
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="flex-1 flex flex-col min-h-0">
          {/* Logo */}
          <div className="hidden md:flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-themeAccentFrom to-themeAccentTo flex items-center justify-center shadow-lg shadow-themeAccentFrom/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-extrabold text-xl bg-gradient-to-r from-white to-slate-350 bg-clip-text text-transparent tracking-tight font-display">sYnX</span>
          </div>

          {isCreatingList && (
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1 mb-4">
              <svg className="w-3.5 h-3.5 animate-spin text-themeAccentFrom" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating list...
            </div>
          )}

          {/* Lists Section */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">My Lists</h3>
              <button
                onClick={() => setIsCreateListOpen(true)}
                className="text-slate-500 hover:text-themeAccentText p-1 rounded-md hover:bg-white/[0.04] transition-all duration-205 cursor-pointer bg-transparent"
                title="Create new list"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-1 scrollbar-thin overscroll-contain">
              {lists.map((list: any) => {
                const isActive = list.id === activeListId;
                const remainingCount = list.todos.filter((t: any) => !t.completed).length;

                return (
                  <div
                    key={list.id}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200 border
                      ${isActive
                        ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                        : "bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-themeCardHover"
                      }`}
                  >
                    <a
                      href={`/${list.id}`}
                      onClick={() => setIsSidebarOpen(false)}
                      className="flex items-center gap-2.5 flex-1 min-w-0"
                    >
                      <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-themeAccentText" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs font-semibold truncate">{list.name}</span>
                      {list.category && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 font-medium shrink-0">
                          {list.category}
                        </span>
                      )}
                    </a>

                    <div className="flex items-center gap-1.5">
                      {remainingCount > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-themeAccentBg text-themeAccentText" : "bg-white/5 text-slate-400"}`}>
                          {remainingCount}
                        </span>
                      )}

                      {/* Options (Rename & Delete) */}
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-200 bg-slate-900/80 px-1 py-0.5 rounded-md border border-white/5 shadow-sm absolute right-2">
                        <button
                          onClick={() => {
                            setListToRename({ id: list.id, name: list.name });
                            setRenameInput(list.name);
                          }}
                          className="text-slate-500 hover:text-themeAccentText p-0.5 rounded transition-colors"
                          title="Rename list"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {lists.length > 1 && (
                          <button
                            onClick={() => setListToDelete({ id: list.id, name: list.name })}
                            className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                            title="Delete list"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        {/* User profile bottom widget */}
        <div className="border-t border-themeBorder pt-4 mt-4 relative z-10 shrink-0">
          {isLoggedIn ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-themeAccentBg border border-themeAccentRing/30 flex items-center justify-center text-themeAccentText font-bold text-xs flex-shrink-0 shadow-inner select-none">
                  {email.split("@")[0].substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-350 truncate">{email}</p>
                  <span className="text-[9px] text-slate-500 font-medium">Synced Profile</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-slate-400 hover:text-themeAccentText p-1.5 rounded-lg hover:bg-themeCardHover border border-transparent hover:border-white/5 transition-all duration-200 cursor-pointer"
                  title="Profile, Statistics & Themes"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <form action="/logout" method="post" className="inline">
                  <button
                    type="submit"
                    className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-200 cursor-pointer bg-transparent"
                    title="Sign Out"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Unsaved Guest</span>
                </div>
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-slate-400 hover:text-themeAccentText p-1 rounded-lg hover:bg-white/[0.04] transition-all duration-200 cursor-pointer bg-transparent"
                  title="Guest Statistics & Themes"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                </button>
              </div>
              <a
                href="/login"
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white bg-gradient-to-r from-themeAccentFrom to-themeAccentTo hover:from-themeAccentFrom hover:to-themeAccentTo rounded-xl py-2.5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-themeAccentFrom/20 active:scale-98"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign In to Save Lists
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────── */}
      <main className="relative z-10 flex flex-col py-6 px-4 sm:px-5 md:px-6 lg:px-8 max-w-2xl mx-auto w-full min-w-0 md:max-w-none md:h-screen md:overflow-x-hidden md:overflow-y-auto">
        
        {/* Header (Active list title + Progress) */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.04] pb-6 min-w-0">
          <div className="min-w-0 flex-1 overflow-hidden">
            {isEditingTitle && isOwner ? (
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleSubmit();
                    if (e.key === "Escape") {
                      setTitleInput(activeListName);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="text-2xl sm:text-3xl font-extrabold bg-transparent border-b-2 border-themeAccentFrom text-slate-100 focus:outline-none py-0.5 w-full font-display"
                  autoFocus
                />
                <button
                  onClick={handleTitleSubmit}
                  className="bg-themeAccentFrom hover:bg-themeAccentTo text-white rounded-lg p-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 group">
                <h1
                  onClick={() => { if (isOwner) setIsEditingTitle(true); }}
                  className={`text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent font-display truncate pr-2 ${isOwner ? "cursor-pointer hover:opacity-85" : ""}`}
                  title={isOwner ? "Click to rename list" : undefined}
                >
                  {activeListName}
                </h1>
                {isOwner && (
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-themeAccentText p-1 rounded transition-all duration-200"
                    aria-label="Rename list inline"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
                {/* Active List Category Badge */}
                {activeListMeta && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) return;
                      const cat = activeListMeta.category || "Checklist";
                      setListToEditCategory({ id: activeListMeta.id, name: activeListName, category: cat });
                      const PRESETS = ["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness"];
                      if (PRESETS.includes(cat)) {
                        setEditCategorySelection(cat);
                        setEditCustomCategoryInput("");
                      } else {
                        setEditCategorySelection("Custom");
                        setEditCustomCategoryInput(cat);
                      }
                    }}
                    className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md border transition-all duration-200 flex items-center gap-1 ${
                      canEdit ? "cursor-pointer hover:border-themeAccentRing/50 hover:bg-white/[0.08]" : "cursor-default"
                    } bg-white/[0.04] border-white/[0.08] text-slate-350`}
                    title={canEdit ? "Click to edit category" : undefined}
                  >
                    <span>🏷️ {activeListMeta.category || "Checklist"}</span>
                    {canEdit && <span className="text-[9px] text-slate-500">✏️</span>}
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {activeCount === 0 && totalCount > 0
                ? "🎉 All tasks completed!"
                : `${activeCount} task${activeCount !== 1 ? "s" : ""} remaining`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 self-start sm:self-auto">
            <ProgressRing completed={completedCount} total={totalCount} />
          </div>
        </header>

        {/* Create Task Form / View Only Banner */}
        {!canEdit ? (
          <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold">
              <span>👁 View-Only Access</span>
              <span className="text-indigo-400/70 font-normal">— You are viewing a shared list with read-only permissions.</span>
            </div>
          </div>
        ) : (
        <createFetcher.Form
          method="post"
          className="mb-6"
          onSubmit={(e) => {
            let timeMs = 0;
            if (reminderMode !== "none") {
              if (reminderMode === "duration") {
                timeMs = Date.now() + reminderDuration * 60 * 1000;
              } else if (reminderMode === "specific" && reminderDateTime) {
                timeMs = new Date(reminderDateTime).getTime();
              }
              if (timeMs > 0) {
                const hiddenInput = e.currentTarget.querySelector('input[name="reminderAt"]') as HTMLInputElement;
                if (hiddenInput) {
                  hiddenInput.value = timeMs.toString();
                }
              }
            }
            const formEl = e.currentTarget;
            const textInput = formEl.querySelector('input[name="text"]') as HTMLInputElement;
            const textVal = textInput ? textInput.value : "";
            if (!isLoggedIn && !isSharedServerList && textVal.trim()) {
              handleGuestAction("create", {
                text: textVal.trim(),
                priority: newPriority,
                reminderAt: timeMs > 0 ? timeMs : undefined,
                recurrence: "none"
              });
            }
          }}
        >
          <input type="hidden" name="reminderAt" value="" />
          <div className="flex flex-col lg:flex-row gap-2.5 min-w-0">
            <div className="flex-1 relative min-w-0">
              <input
                ref={inputRef}
                type="text"
                name="text"
                required
                className="w-full min-w-0 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 shadow-inner px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 focus:border-themeAccentRing/50 transition-all duration-200"
                placeholder="What needs to be done?"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <div className="relative flex-1 sm:flex-initial min-w-0" title="Est. Duration in minutes">
                <input
                  type="hidden"
                  name="durationMinutes"
                  value={newDurationMinutes !== null ? newDurationMinutes : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowDurationPicker(!showDurationPicker)}
                  className={`h-full w-full rounded-xl border px-3.5 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    newDurationMinutes !== null
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                      : "bg-white/[0.04] border-white/[0.06] text-slate-400 hover:text-slate-200"
                  }`}
                  title="Set Estimated Duration"
                >
                  <span>⏱️</span>
                  <span className="hidden sm:inline">
                    {newDurationMinutes !== null ? `${newDurationMinutes}m` : "Duration"}
                  </span>
                </button>
              </div>

              <div className="relative flex-1 sm:flex-initial min-w-0">
                <select
                  name="priority"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as "low" | "medium" | "high" | "none")}
                  className="h-full w-full max-w-full rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-350 text-xs px-3 py-3 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition-all duration-200 cursor-pointer appearance-none bg-slate-900 pr-6"
                >
                  <option value="none" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>⚪ No Priority</option>
                  <option value="low" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>🟢 Low Priority</option>
                  <option value="medium" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>🟡 Medium Priority</option>
                  <option value="high" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>🔴 High Priority</option>
                </select>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setShowReminderPanel(!showReminderPanel);
                  if (!showReminderPanel) {
                    const granted = await requestNotificationPermission();
                    if (!granted) {
                      showToast("⚠️ Enable notifications to get alerts!");
                    }
                  }
                }}
                className={`rounded-xl border px-3.5 py-3 text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 cursor-pointer
                  ${reminderMode !== "none"
                    ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                    : "bg-white/[0.04] border-white/[0.06] text-slate-400 hover:text-slate-200"
                  }`}
                title="Set Reminder Alert"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">
                  {reminderMode === "none" ? "Remind" : reminderMode === "duration" ? `${reminderDuration}m` : "Time"}
                </span>
              </button>

              <button
                type="submit"
                name="intent"
                value="create"
                disabled={isCreating}
                className="rounded-xl bg-gradient-to-r from-themeAccentFrom to-themeAccentTo hover:from-themeAccentFrom hover:to-themeAccentTo text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-themeAccentFrom/10 hover:shadow-themeAccentFrom/25 transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-98 flex items-center justify-center min-w-[70px]"
              >
                {isCreating ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  "Add"
                )}
              </button>
            </div>
          </div>

          {showDurationPicker && (
            <div className="mt-2.5 p-3.5 rounded-xl bg-slate-900 border border-white/10 flex flex-col gap-2.5 animate-fade-in shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">ESTIMATED DURATION</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewDurationMinutes(null);
                    setShowDurationPicker(false);
                  }}
                  className="text-[10px] font-semibold text-rose-400 hover:underline cursor-pointer bg-transparent"
                >
                  Clear Duration
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "5m", value: 5 },
                  { label: "15m", value: 15 },
                  { label: "30m", value: 30 },
                  { label: "45m", value: 45 },
                  { label: "60m", value: 60 },
                ].map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => {
                      setNewDurationMinutes(d.value);
                      setShowDurationPicker(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      newDurationMinutes === d.value
                        ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                        : "bg-white/[0.04] border-white/[0.06] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[10px] text-slate-400 font-medium">Custom:</span>
                  <input
                    type="number"
                    min={1}
                    max={480}
                    placeholder="Mins"
                    value={newDurationMinutes && ![5, 15, 30, 45, 60].includes(newDurationMinutes) ? newDurationMinutes : ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setNewDurationMinutes(val);
                    }}
                    className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 text-center"
                  />
                </div>
              </div>
            </div>
          )}

          {showReminderPanel && (
            <div className="mt-2.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">REMINDER SETTING</span>
                <button
                  type="button"
                  onClick={() => {
                    setReminderMode("none");
                    setShowReminderPanel(false);
                  }}
                  className="text-[10px] font-semibold text-rose-400 hover:underline cursor-pointer bg-transparent"
                >
                  Clear Reminder
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {[1, 5, 15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={async () => {
                      setReminderMode("duration");
                      setReminderDuration(mins);
                      await requestNotificationPermission();
                    }}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                      ${reminderMode === "duration" && reminderDuration === mins
                        ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                        : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                      }`}
                  >
                    ⏱ {mins < 60 ? `${mins} Min${mins > 1 ? "s" : ""}` : "1 Hour"}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("specific");
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "specific"
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                    }`}
                >
                  📅 Specific Time...
                </button>
              </div>

              {reminderMode === "specific" && (
                <div className="flex flex-col gap-1.5 max-w-xs">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Choose date & time</span>
                  <input
                    type="datetime-local"
                    value={reminderDateTime}
                    onChange={(e) => setReminderDateTime(e.target.value)}
                    required={reminderMode === "specific"}
                    className="rounded-lg bg-slate-900 border border-white/[0.08] text-slate-300 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 focus:border-themeAccentRing/50 transition-all cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </createFetcher.Form>
        )}

        {/* Toolbar (Filters, Search, Sort & Actions) */}
        <div className="flex flex-col gap-3.5 mb-5 border-b border-white/[0.04] pb-5 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            {/* Search Box */}
            <div className="relative flex-1 max-w-sm min-w-0">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-w-0 text-xs rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-200 placeholder-slate-500 pl-8 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
              />
              <svg className="w-4 h-4 text-slate-500 absolute left-2.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-slate-500 hover:text-slate-300 absolute right-2.5 top-2.5 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-300 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 cursor-pointer appearance-none bg-slate-900 pr-8 relative max-w-[11rem]"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundSize: '1.25rem',
                  backgroundRepeat: 'no-repeat'
                }}
              >
                <option value="created" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>🕒 Date Created</option>
                <option value="priority" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>🔴 Priority</option>
                <option value="reminder" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>⏰ Reminder Time</option>
                <option value="alphabetical" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>🔤 Alphabetical</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
            <div className="flex flex-wrap gap-3 items-center min-w-0">
              {/* Filter buttons */}
              <div className="flex gap-1 bg-white/[0.02] border border-white/[0.04] rounded-xl p-1 self-start">
                {filterButtons.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                      ${filter === f.key
                        ? "bg-themeAccentBg text-themeAccentText shadow-sm"
                        : "text-slate-500 hover:text-slate-350"
                      }`}
                  >
                    {f.label}
                    <span className="ml-1.5 opacity-50 font-bold">
                      {f.key === "all" ? totalCount : f.key === "active" ? activeCount : completedCount}
                    </span>
                  </button>
                ))}
              </div>

              {/* View switcher */}
              <div className="flex gap-1 bg-white/[0.02] border border-white/[0.04] rounded-xl p-1 self-start">
                <button
                  type="button"
                  onClick={() => changeViewMode("list")}
                  className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                    ${viewMode === "list"
                      ? "bg-themeAccentBg text-themeAccentText shadow-sm"
                      : "text-slate-500 hover:text-slate-350"
                    }`}
                >
                  📝 List
                </button>
                <button
                  type="button"
                  onClick={() => changeViewMode("calendar")}
                  className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                    ${viewMode === "calendar"
                      ? "bg-themeAccentBg text-themeAccentText shadow-sm"
                      : "text-slate-500 hover:text-slate-350"
                    }`}
                >
                  📅 Calendar
                </button>
              </div>
            </div>

            {/* Action buttons (Clear completed, Share Popover) */}
            <div className="flex gap-3 items-center self-end sm:self-auto shrink-0">
              {completedCount > 0 && (
                <clearFetcher.Form
                  method="post"
                  onSubmit={() => {
                    if (!isLoggedIn && !isSharedServerList) {
                      handleGuestAction("clearCompleted", {});
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="clearCompleted" />
                  <button
                    type="submit"
                    className="text-xs text-slate-500 hover:text-rose-400 font-semibold transition-colors duration-200 cursor-pointer bg-transparent"
                  >
                    Clear completed
                  </button>
                </clearFetcher.Form>
              )}

              {/* Enhanced Share Menu */}
              <div ref={sharePopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowSharePopover(!showSharePopover)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-themeAccentText font-semibold transition-colors duration-200 cursor-pointer bg-transparent"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l5.053-2.526m0 3.568l-5.053-2.526A3 3 0 1111 8a3 3 0 011.684 2.742l5.053 2.526A3 3 0 1112 21a3 3 0 01-3.316-2.258l-5.053-2.526A3 3 0 118.684 10.742z" />
                  </svg>
                  Share List ({activeListShareMode === "private" ? "Private" : activeListShareMode === "public_read" ? "View-Only" : "Collaborative"})
                </button>

                {showSharePopover && (
                  <div className="absolute right-0 top-full mt-2.5 z-[60] bg-slate-900 border border-white/10 rounded-xl p-4 shadow-2xl min-w-[260px] flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Share Settings</span>
                      <p className="text-[10px] text-slate-400">Configure access permissions for this list.</p>
                    </div>

                    {isOwner ? (
                      <div className="flex flex-col gap-2">
                        {(["private", "public_read", "public_edit"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={`w-full text-left text-xs font-semibold p-2.5 rounded-lg border transition-all duration-200 flex items-center justify-between
                              ${activeListShareMode === mode
                                ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                                : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                              }`}
                            onClick={() => {
                              listFetcher.submit({
                                intent: "updateShareMode",
                                listId: activeListId || "",
                                shareMode: mode
                              }, { method: "post" });
                              showToast(`✓ Share permission updated to ${mode}!`);
                            }}
                          >
                            <span>
                              {mode === "private" ? "🔒 Private" : mode === "public_read" ? "👁 View-Only" : "🤝 Collaborative"}
                            </span>
                            {activeListShareMode === mode && <span className="text-xs">✓</span>}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 text-[11px] text-slate-500">
                        You do not own this list. Permissions are managed by the owner.
                      </div>
                    )}

                    <hr className="border-white/[0.06]" />

                    <button
                      type="button"
                      disabled={activeListShareMode === "private" && !isOwner}
                      onClick={() => {
                        const url = window.location.href;
                        navigator.clipboard.writeText(url).then(() => {
                          showToast("✓ Link copied to clipboard!");
                        });
                        setShowSharePopover(false);
                      }}
                      className="w-full text-center text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl py-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Copy Sharing Link
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Todo List Area */}
        <div className="flex-1 min-h-0 mb-6 flex flex-col">
          {viewMode === "calendar" ? (
            <CalendarView todos={optimisticTodos} activeListId={activeListId || ""} />
          ) : visibleParents.length === 0 && totalCount === 0 ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col justify-center">
              <EmptyState />
            </div>
          ) : visibleParents.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No {filter === "active" ? "active" : "completed"} tasks in this list.
            </div>
          ) : (
            <ul className="space-y-2 flex-1 overflow-y-auto pr-1 scrollbar-thin">
              {visibleParents.map((todo) => (
                <TodoItem 
                  key={todo.id} 
                  todo={todo} 
                  subtasks={subtasksMap[todo.id] || []}
                  canEdit={canEdit}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto pt-6 border-t border-white/[0.04] text-center max-w-lg mx-auto w-full flex flex-col items-center gap-1">
          <p className="text-slate-500 text-[11px] font-medium flex items-center gap-1.5 justify-center">
            <span>sYnX • Sync your tasks. Execute your day.</span>
            <span className="text-slate-600">•</span>
            <a
              href="https://christran.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-themeAccentText transition-colors duration-200"
            >
              christran.io
            </a>
          </p>
          <div className="flex gap-2 text-[10px] text-slate-600">
            <a
              href="https://christran.io/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-themeAccentText transition-colors duration-200"
            >
              Privacy Policy
            </a>
            <span>•</span>
            <a
              href="https://christran.io/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-themeAccentText transition-colors duration-200"
            >
              Terms of Service
            </a>
          </div>
        </footer>
      </main>

      {/* ── Profile and Statistics Modal ─────────────────── */}
      {isProfileOpen && (
        <div
          onClick={requestCloseProfile}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center overflow-y-auto p-4 transition-all duration-300 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl p-6 relative overflow-hidden cursor-default"
          >
            {/* Glow design */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-themeAccentFrom/10 rounded-full blur-3xl pointer-events-none" />

            <button
              onClick={requestCloseProfile}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors bg-transparent cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Profile Detail */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-themeAccentFrom to-themeAccentTo flex items-center justify-center text-white font-extrabold text-xl shadow-xl shadow-themeAccentFrom/10 mb-3 border border-white/10 relative">
                {email.split("@")[0].substring(0, 2).toUpperCase()}
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </div>
              <h3 className="text-base font-bold text-slate-200 font-display">{email}</h3>
              <div className="flex items-center gap-1.5 mt-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1">
                <span className="text-[10px] font-mono text-slate-400 select-all">User ID: {userId}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(userId);
                    showToast("✓ Copied User ID!");
                  }}
                  className="text-slate-500 hover:text-themeAccentText transition-colors bg-transparent"
                  title="Copy User ID"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Statistics */}
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Usage Metrics</h4>
            <div className="grid grid-cols-3 gap-2.5 mb-6">
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-lg font-extrabold text-themeAccentText">{stats.totalLists}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Lists</div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-lg font-extrabold text-themeAccentText">{stats.totalTasks}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tasks</div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-lg font-extrabold text-themeAccentText">
                  {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
                </div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Done</div>
              </div>
            </div>

            {/* Theme Picker */}
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Color Themes</h4>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {[
                { id: "midnight", name: "Midnight Indigo", bg: "bg-slate-950 border-indigo-500/50" },
                { id: "emerald", name: "Emerald Forest", bg: "bg-emerald-950 border-emerald-500/50" },
                { id: "sunset", name: "Sunset Rose", bg: "bg-stone-900 border-rose-500/50" },
                { id: "cyberpunk", name: "Cyberpunk Neon", bg: "bg-black border-pink-500/50" },
                { id: "pastel", name: "Light Pastel", bg: "bg-amber-50 border-indigo-500/50" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => changeTheme(t.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 text-left
                    ${theme === t.id
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText shadow-md"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                    }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border ${t.bg} flex-shrink-0`} />
                  {t.name}
                </button>
              ))}
            </div>

            {/* Notification Settings */}
            <div className="mb-6">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Notification Channels</h4>
              {isLoggedIn ? (
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex flex-col gap-4 text-xs">
                  {/* Email Channel */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-300">Email Notifications</p>
                      <p className="text-[10px] text-slate-500">
                        Receive alerts at {email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative
                        ${emailEnabled ? "bg-themeAccentFrom" : "bg-slate-800"}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                        ${emailEnabled ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <hr className="border-white/[0.04]" />

                  {/* SMS Channel */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-300">SMS Notifications</p>
                        <p className="text-[10px] text-slate-500">Receive text alerts</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSmsEnabled(!smsEnabled)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative
                          ${smsEnabled ? "bg-themeAccentFrom" : "bg-slate-800"}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                          ${smsEnabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                    {smsEnabled && (
                      <div className="flex flex-col gap-2">
                        <div className="flex rounded-lg bg-slate-950 border border-white/[0.08] overflow-hidden focus-within:ring-1 focus-within:ring-themeAccentRing/50">
                          <span className="bg-white/[0.04] text-slate-400 px-3 py-2 text-xs border-r border-white/[0.08] select-none flex items-center">
                            +1
                          </span>
                          <input
                            type="tel"
                            placeholder="10-digit number"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, "").substring(0, 10))}
                            className="w-full text-xs bg-transparent text-slate-350 px-3 py-2 focus:outline-none"
                            required
                            pattern="[0-9]{10}"
                            maxLength={10}
                          />
                        </div>
                        <div>
                          <select
                            value={phoneCarrier}
                            onChange={(e) => setPhoneCarrier(e.target.value)}
                            className="w-full rounded-lg bg-slate-950 border border-white/[0.08] text-slate-400 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 appearance-none bg-slate-955"
                          >
                            <option value="" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>-- Mobile Carrier (Optional / Twilio) --</option>
                            <option value="verizon" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Verizon</option>
                            <option value="att" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>AT&T</option>
                            <option value="tmobile" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>T-Mobile</option>
                            <option value="sprint" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Sprint</option>
                            <option value="googlefi" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Google Fi</option>
                            <option value="boost" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Boost Mobile</option>
                            <option value="cricket" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Cricket Wireless</option>
                            <option value="uscellular" className="bg-slate-900 text-slate-100" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>US Cellular</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <hr className="border-white/[0.04]" />

                  {/* Discord Channel */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-300">Discord Webhook</p>
                        <p className="text-[10px] text-slate-500">Alert in your Discord channel</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDiscordEnabled(!discordEnabled)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative
                          ${discordEnabled ? "bg-themeAccentFrom" : "bg-slate-800"}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                          ${discordEnabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                    {discordEnabled && (
                      <input
                        type="url"
                        placeholder="https://discord.com/api/webhooks/..."
                        value={discordInput}
                        onChange={(e) => setDiscordInput(e.target.value)}
                        className="w-full text-xs rounded-lg bg-slate-950 border border-white/[0.08] text-slate-355 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
                      />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cleanPhone = phoneInput.replace(/\D/g, "");
                      if (smsEnabled && cleanPhone.length !== 10) {
                        showToast("⚠️ Phone number must be exactly 10 digits!");
                        return;
                      }
                      settingsFetcher.submit({
                        intent: "updateSettings",
                        emailEnabled: emailEnabled ? "true" : "false",
                        smsEnabled: smsEnabled ? "true" : "false",
                        phoneNumber: smsEnabled ? `+1${cleanPhone}` : "",
                        phoneCarrier: smsEnabled ? phoneCarrier : "",
                        discordWebhookUrl: discordEnabled ? discordInput : "",
                      }, { method: "post" });
                      showToast("✓ Saved Preferences!");
                    }}
                    className="w-full mt-2 text-center text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl py-2.5 transition-all cursor-pointer shadow-md active:scale-[0.98]"
                  >
                    Save Preferences
                  </button>
                </div>
              ) : (
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex flex-col items-center gap-2 text-xs text-center">
                  <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider select-none">
                    Sign In Required
                  </span>
                  <p className="text-slate-400 text-xs">
                    Sign in to configure Email, SMS, and Discord task notifications.
                  </p>
                  <a
                    href="/login"
                    className="mt-1 inline-block text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl px-4 py-2 transition-all shadow-md active:scale-[0.98]"
                  >
                    Sign In
                  </a>
                </div>
              )}
            </div>

            {/* Controls */}
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Options</h4>
            <div className="space-y-2">
              <button
                onClick={handleExportData}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] rounded-xl px-4 py-3 transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-themeAccentText" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export All Lists (JSON)
                </span>
                <span className="text-[10px] text-slate-500">Download</span>
              </button>

              {isLoggedIn ? (
                <form action="/logout" method="post" className="w-full">
                  <button
                    type="submit"
                    className="w-full flex items-center justify-between text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </span>
                    <span className="text-[10px] text-rose-400/80">End Session</span>
                  </button>
                </form>
              ) : (
                <a
                  href="/login"
                  className="w-full flex items-center justify-between text-xs font-semibold text-themeAccentText hover:text-themeAccentText bg-themeAccentBg hover:bg-themeAccentBg/20 border border-themeAccentRing/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign In to Save Indefinitely
                  </span>
                  <span className="text-[10px] text-themeAccentText/85">Persist Data</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Unsaved Settings Prompt Modal ────────────────────── */}
      {showUnsavedPrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-100 font-display mb-2">Unsaved Notification Settings</h3>
            <p className="text-xs text-slate-400 mb-6">
              You have unsaved changes to your notification preferences. Would you like to save or discard your changes before exiting?
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowUnsavedPrompt(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSettings();
                  setShowUnsavedPrompt(false);
                  setIsProfileOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => {
                  const saved = handleSaveSettings();
                  if (saved) {
                    setShowUnsavedPrompt(false);
                    setIsProfileOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo shadow-md transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename List Dialog Modal ──────────────────────── */}
      {listToRename && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-3 font-display">Rename List</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition-all duration-200 mb-5"
              placeholder="Enter new list name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (renameInput.trim()) {
                    if (!isLoggedIn && !isSharedServerList) {
                      handleGuestAction("renameList", { listId: listToRename.id, newName: renameInput.trim() });
                    } else {
                      listFetcher.submit(
                        { intent: "renameList", listId: listToRename.id, newName: renameInput.trim() },
                        { method: "post" }
                      );
                    }
                  }
                  setListToRename(null);
                }
              }}
            />
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setListToRename(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (renameInput.trim()) {
                    if (!isLoggedIn && !isSharedServerList) {
                      handleGuestAction("renameList", { listId: listToRename.id, newName: renameInput.trim() });
                    } else {
                      listFetcher.submit(
                        { intent: "renameList", listId: listToRename.id, newName: renameInput.trim() },
                        { method: "post" }
                      );
                    }
                  }
                  setListToRename(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl shadow-lg transition-all duration-200"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete List Dialog Modal ──────────────────────── */}
      {listToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-2 font-display">Delete this list?</h3>
            <p className="text-xs text-slate-400 mb-5">
              Are you sure you want to delete <span className="text-rose-400 font-semibold">"{listToDelete.name}"</span>? This will permanently delete all tasks inside this list. This action is irreversible.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setListToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isLoggedIn && !isSharedServerList) {
                    handleGuestAction("deleteList", { listId: listToDelete.id });
                    const remaining = guestLists.filter((l) => l.id !== listToDelete.id);
                    if (remaining.length > 0) {
                      navigate(`/${remaining[0].id}`);
                    } else {
                      navigate(`/${userId}`);
                    }
                  } else {
                    listFetcher.submit(
                      { intent: "deleteList", listId: listToDelete.id },
                      { method: "post" }
                    );
                  }
                  setListToDelete(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-lg transition-all duration-200"
              >
                Delete List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create List Dialog Modal ──────────────────────── */}
      {isCreateListOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-3 font-display">Create New List</h3>
            
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">List Name</label>
            <input
              type="text"
              value={newListInput}
              onChange={(e) => setNewListInput(e.target.value)}
              className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition-all duration-200 mb-4"
              placeholder="Enter list name (e.g., Shopping, Work)..."
              autoFocus
            />

            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Select Category Tag</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness", "Custom"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setNewListCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer transition-all ${
                    newListCategory === cat
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-bold shadow-sm"
                      : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat === "Custom" ? "✏️ Custom" : cat}
                </button>
              ))}
            </div>

            {newListCategory === "Custom" && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Custom Category Name</label>
                <input
                  type="text"
                  value={customCategoryInput}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
                  placeholder="e.g. Project Alpha..."
                />
              </div>
            )}

            <div className="flex gap-2.5 justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  setNewListInput("");
                  setCustomCategoryInput("");
                  setIsCreateListOpen(false);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newListInput.trim()) {
                    const finalCategory = newListCategory === "Custom" ? (customCategoryInput.trim() || "Custom") : newListCategory;
                    if (!isLoggedIn) {
                      const newId = crypto.randomUUID();
                      handleGuestAction("createList", { id: newId, name: newListInput.trim(), category: finalCategory });
                      setNewListInput("");
                      setCustomCategoryInput("");
                      setIsCreateListOpen(false);
                      navigate(`/${newId}`);
                    } else {
                      listFetcher.submit(
                        { intent: "createList", listName: newListInput.trim(), category: finalCategory } as any,
                        { method: "post" }
                      );
                      setNewListInput("");
                      setCustomCategoryInput("");
                      setIsCreateListOpen(false);
                    }
                  } else {
                    setNewListInput("");
                    setCustomCategoryInput("");
                    setIsCreateListOpen(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl shadow-lg transition-all duration-200"
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit List Category Modal ──────────────────────── */}
      {listToEditCategory && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-1 font-display">Edit Category Tag</h3>
            <p className="text-xs text-slate-400 mb-4">Set or update the category tag for "{listToEditCategory.name}"</p>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness", "Custom"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setEditCategorySelection(cat)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer transition-all ${
                    editCategorySelection === cat
                      ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-bold shadow-sm"
                      : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat === "Custom" ? "✏️ Custom" : cat}
                </button>
              ))}
            </div>

            {editCategorySelection === "Custom" && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Custom Category Name</label>
                <input
                  type="text"
                  value={editCustomCategoryInput}
                  onChange={(e) => setEditCustomCategoryInput(e.target.value)}
                  className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50"
                  placeholder="e.g. Special Project..."
                  autoFocus
                />
              </div>
            )}

            <div className="flex gap-2.5 justify-end mt-2">
              <button
                type="button"
                onClick={() => setListToEditCategory(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalCategory = editCategorySelection === "Custom" ? (editCustomCategoryInput.trim() || "Custom") : editCategorySelection;
                  if (!isLoggedIn) {
                    handleGuestAction("updateListCategory", { id: listToEditCategory.id, category: finalCategory });
                  } else {
                    listFetcher.submit(
                      { intent: "updateListCategory", listId: listToEditCategory.id, category: finalCategory } as any,
                      { method: "post" }
                    );
                  }
                  setListToEditCategory(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-themeAccentFrom hover:bg-themeAccentTo rounded-xl shadow-lg transition-all duration-200"
              >
                Save Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
    </GuestContext.Provider>
  );
}
