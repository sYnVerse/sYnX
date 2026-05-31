import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect,
  json,
} from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { TodoManager, type Todo, type UserSettings } from "~/to-do-manager";
import { useState, useRef, useEffect, useCallback } from "react";
import { getOptionalUser } from "~/auth.server";

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

  // Load lists
  let lists: any[] = [];
  try {
    const { results: listRows } = await db.prepare("SELECT * FROM lists WHERE owner_id = ? ORDER BY created_at ASC").bind(userId).all();
    lists = listRows || [];
  } catch (e) {
    console.error("Failed to load lists:", e);
  }

  // Default setup if no lists exist
  if (lists.length === 0) {
    const defaultListId = crypto.randomUUID();
    try {
      await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)")
        .bind(defaultListId, "My Tasks", userId, Date.now(), isLoggedIn ? null : 86400)
        .run();
    } catch (e) {
      console.error("Failed to create default list:", e);
    }

    if (isNewGuest && guestId) {
      return redirect(`/${defaultListId}`, { headers });
    }
    return redirect(`/${defaultListId}`);
  }

  // Verify that the requested list exists in user's lists
  const activeListId = params.id;
  const activeListExists = lists.some((l: any) => l.id === activeListId);
  if (!activeListExists) {
    // Redirect to the first list
    if (lists.length > 0) {
      return redirect(`/${lists[0].id}`, { headers: isNewGuest && guestId ? headers : undefined });
    } else {
      const defaultListId = crypto.randomUUID();
      try {
        await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)")
          .bind(defaultListId, "My Tasks", userId, Date.now(), isLoggedIn ? null : 86400)
          .run();
      } catch (e) {
        console.error("Failed to create fallback list:", e);
      }
      return redirect(`/${defaultListId}`, { headers: isNewGuest && guestId ? headers : undefined });
    }
  }

  // Load all todos for the user's lists in a single join query
  let allTodos: any[] = [];
  try {
    const { results } = await db.prepare(`
      SELECT t.* FROM todos t
      JOIN lists l ON t.list_id = l.id
      WHERE l.owner_id = ?
    `).bind(userId).all();
    allTodos = results || [];
  } catch (e) {
    console.error("Failed to query todos:", e);
  }

  const listsWithTodos = lists.map((list: any) => {
    const listTodos = allTodos
      .filter((t: any) => t.list_id === list.id)
      .map((t: any) => ({
        id: t.id,
        text: t.text,
        completed: Boolean(t.completed),
        createdAt: Number(t.created_at),
        priority: t.priority as "low" | "medium" | "high",
        reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
        reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
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
  if (userId) {
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
    activeListId,
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

  // Check list ownership
  let hasOwnership = false;
  if (activeListId) {
    try {
      const hasOwnershipRow = await db.prepare("SELECT 1 FROM lists WHERE id = ? AND owner_id = ?").bind(activeListId, userId).first();
      hasOwnership = !!hasOwnershipRow;
    } catch (e) {
      console.error("Failed to verify list ownership:", e);
    }
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  // For non-list creation actions, verify ownership of the active list
  if (intent !== "createList" && !hasOwnership) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }

  const todoManager = new TodoManager(db, activeListId);

  switch (intent) {
    case "create": {
      const text = formData.get("text");
      const priority =
        (formData.get("priority") as "low" | "medium" | "high") || "medium";
      const reminderAtVal = formData.get("reminderAt");
      const reminderAt = reminderAtVal ? Number(reminderAtVal) : undefined;
      
      if (typeof text !== "string" || !text)
        return Response.json({ error: "Invalid text" }, { status: 400 });
      
      await todoManager.create(text, priority, reminderAt);
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
      const priority = formData.get("priority") as "low" | "medium" | "high";
      await todoManager.updatePriority(id, priority);
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

    case "updateSettings": {
      const emailEnabled = isLoggedIn && formData.get("emailEnabled") === "true";
      const smsEnabled = isLoggedIn && formData.get("smsEnabled") === "true";
      const phoneNumber = isLoggedIn ? ((formData.get("phoneNumber") as string) || "") : "";
      const phoneCarrier = isLoggedIn ? ((formData.get("phoneCarrier") as string) || "") : "";
      const discordWebhookUrl = (formData.get("discordWebhookUrl") as string) || "";

      try {
        await db.prepare(
          `INSERT INTO user_settings (user_id, email_enabled, sms_enabled, phone_number, phone_carrier, discord_webhook_url)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             email_enabled = excluded.email_enabled,
             sms_enabled = excluded.sms_enabled,
             phone_number = excluded.phone_number,
             phone_carrier = excluded.phone_carrier,
             discord_webhook_url = excluded.discord_webhook_url`
        ).bind(
          userId,
          emailEnabled ? 1 : 0,
          smsEnabled ? 1 : 0,
          phoneNumber.trim(),
          phoneCarrier.trim(),
          discordWebhookUrl.trim()
        ).run();
      } catch (e) {
        console.error("Failed to update settings in database:", e);
      }

      return { success: true };
    }

    case "clearCompleted": {
      await todoManager.clearCompleted();
      return { success: true };
    }

    case "createList": {
      const listName = formData.get("listName");
      if (typeof listName !== "string" || !listName.trim()) {
        return Response.json({ error: "Invalid list name" }, { status: 400 });
      }
      const newListId = crypto.randomUUID();
      try {
        await db.prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)")
          .bind(newListId, listName.trim(), userId, Date.now(), isLoggedIn ? null : 86400)
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
      try {
        await db.prepare("UPDATE lists SET name = ? WHERE id = ?").bind(newName.trim(), listId).run();
      } catch (e) {
        console.error("Failed to rename list:", e);
      }
      return { success: true };
    }

    case "deleteList": {
      const listId = formData.get("listId") as string;
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
    fetcher.submit(
      {
        intent: "updateReminder",
        id: todo.id,
        reminderAt: (Date.now() + minutes * 60 * 1000).toString(),
      },
      { method: "post" }
    );
    setOpen(false);
  };

  const clearReminder = () => {
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
        {displayText && <span>{displayText}</span>}
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
    <div className="flex flex-col items-center justify-center py-16 px-4 select-none">
      <svg
        className="w-28 h-28 mb-4 opacity-40 text-indigo-400"
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
  currentPriority: "low" | "medium" | "high";
  todoId: string;
}) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const optimisticPriority =
    fetcher.formData?.get("priority") as "low" | "medium" | "high" | null;
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
          {(["high", "medium", "low"] as const).map((p) => {
            const c = priorityConfig[p];
            return (
              <button
                key={p}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors hover:bg-white/[0.04] ${c.color}`}
                onClick={() => {
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

function TodoItem({ todo }: { todo: Todo }) {
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const isToggling = toggleFetcher.formData?.get("intent") === "toggle";
  const isDeleting = deleteFetcher.formData?.get("intent") === "delete";
  const optimisticCompleted = isToggling ? !todo.completed : todo.completed;

  if (isDeleting) return null;

  return (
    <li
      className={`group flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] p-3.5 rounded-xl shadow-sm transition-all duration-300
        ${optimisticCompleted ? "opacity-60" : "opacity-100"}`}
    >
      <toggleFetcher.Form method="post" className="flex-shrink-0">
        <input type="hidden" name="id" value={todo.id} />
        <input type="hidden" name="intent" value="toggle" />
        <button
          type="submit"
          className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 cursor-pointer
            border-slate-700 hover:border-indigo-500
            data-[checked=true]:bg-indigo-600 data-[checked=true]:border-indigo-600"
          data-checked={optimisticCompleted}
        >
          {optimisticCompleted && (
            <svg
              className="w-3 h-3 text-white animate-scale-up"
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

      <span
        className={`flex-1 text-sm transition-all duration-200 ${
          optimisticCompleted
            ? "line-through text-slate-500 italic opacity-50"
            : "text-slate-200"
        }`}
      >
        {todo.text}
      </span>

      <PriorityPicker currentPriority={todo.priority || "medium"} todoId={todo.id} />
      {!optimisticCompleted && <ReminderPicker todo={todo} />}

      <deleteFetcher.Form method="post">
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
    </li>
  );
}

export default function TodoPage() {
  const { userId, email, isLoggedIn, settings, lists, activeListId, todos, stats } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher();
  const clearFetcher = useFetcher();
  const listFetcher = useFetcher();
  const settingsFetcher = useFetcher();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);
  
  const [filter, setFilter] = useState<Filter>("all");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [toast, setToast] = useState({ message: "", visible: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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

  useEffect(() => {
    setEmailEnabled(settings?.emailEnabled ?? false);
    setSmsEnabled(settings?.smsEnabled ?? false);
    setPhoneInput(getDisplayPhone(settings?.phoneNumber));
    setPhoneCarrier(settings?.phoneCarrier ?? "");
    setDiscordEnabled(!!settings?.discordWebhookUrl);
    setDiscordInput(settings?.discordWebhookUrl ?? "");
  }, [settings]);

  // Reminder States for Creation Form
  const [reminderMode, setReminderMode] = useState<"none" | "duration" | "specific">("none");
  const [reminderDuration, setReminderDuration] = useState<number>(5);
  const [reminderDateTime, setReminderDateTime] = useState<string>("");
  const [showReminderPanel, setShowReminderPanel] = useState(false);

  // Web Notification loop
  const markSentFetcher = useFetcher();
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const checkReminders = () => {
      const now = Date.now();
      const activeTodos = lists.flatMap((list: any) => list.todos || []) as Todo[];

      activeTodos.forEach((todo) => {
        if (
          !todo.completed &&
          todo.reminderAt &&
          !todo.reminderSent &&
          todo.reminderAt <= now &&
          !notifiedIds.current.has(todo.id)
        ) {
          notifiedIds.current.add(todo.id);

          if (Notification.permission === "granted") {
            try {
              const notification = new Notification("sYnX Reminder", {
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

          markSentFetcher.submit(
            { intent: "markReminderSent", id: todo.id },
            { method: "post" }
          );
        }
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [lists, markSentFetcher]);
  
  // Custom modals state
  const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null);
  const [listToRename, setListToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListInput, setNewListInput] = useState("");

  // Handle escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsProfileOpen(false);
        setListToRename(null);
        setListToDelete(null);
        setIsCreateListOpen(false);
      }
    };
    const isAnyModalOpen = isProfileOpen || !!listToRename || !!listToDelete || isCreateListOpen;
    if (isAnyModalOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileOpen, listToRename, listToDelete, isCreateListOpen]);

  // Inline List Title Edit State (Main Panel Header)
  const activeListMeta = lists.find((l: any) => l.id === activeListId);
  const activeListName = activeListMeta?.name || "My Tasks";
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
      // Reset reminder states
      setReminderMode("none");
      setReminderDuration(5);
      setReminderDateTime("");
      setShowReminderPanel(false);
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

  // Optimistic list update
  const optimisticTodos: Todo[] = [...todos] as Todo[];

  // Filter calculations
  const filteredTodos = optimisticTodos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const totalTodos = optimisticTodos.length;
  const completedCount = optimisticTodos.filter((t) => t.completed).length;
  const activeCount = totalTodos - completedCount;

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

  const filterButtons: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalTodos },
    { key: "active", label: "Active", count: activeCount },
    { key: "completed", label: "Done", count: completedCount },
  ];

  return (
    <div className="min-h-screen md:h-screen bg-slate-950 flex flex-col md:grid md:grid-cols-[280px_1fr] relative overflow-hidden font-sans">
      
      {/* ── Ambient Gradient Blobs ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-violet-600/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-fuchsia-600/5 rounded-full blur-[100px]" />
      </div>

      {/* ── Mobile Header Bar ─────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/[0.06] relative z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg">
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
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm md:hidden cursor-pointer"
        />
      )}

      {/* ── Sidebar Component (Desktop and Mobile drawer) ──── */}
      <aside
        className={`fixed md:sticky top-0 left-0 bottom-0 z-40 md:z-10 w-[280px] bg-slate-900 border-r border-white/[0.08] p-5 flex flex-col justify-between transition-transform duration-300 md:transform-none shadow-2xl md:shadow-none
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="flex-1 flex flex-col min-h-0">
          {/* Logo */}
          <div className="hidden md:flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-extrabold text-xl bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent tracking-tight font-display">sYnX</span>
          </div>

          {isCreatingList && (
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1 mb-4">
              <svg className="w-3.5 h-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
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
                className="text-slate-500 hover:text-indigo-400 p-1 rounded-md hover:bg-white/[0.04] transition-all duration-200 cursor-pointer"
                title="Create new list"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1 overflow-y-auto flex-1 pr-1 scrollbar-thin">
              {lists.map((list: any) => {
                const isActive = list.id === activeListId;
                const remainingCount = list.todos.filter((t: any) => !t.completed).length;

                return (
                  <div
                    key={list.id}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200 border
                      ${isActive
                        ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300"
                        : "bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                      }`}
                  >
                    <a
                      href={`/${list.id}`}
                      onClick={() => setIsSidebarOpen(false)}
                      className="flex items-center gap-2.5 flex-1 min-w-0"
                    >
                      <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-indigo-400" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs font-semibold truncate">{list.name}</span>
                    </a>

                    <div className="flex items-center gap-1.5">
                      {remainingCount > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-slate-400"}`}>
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
                          className="text-slate-500 hover:text-indigo-400 p-0.5 rounded transition-colors"
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
        <div className="border-t border-white/[0.06] pt-4 mt-4 relative z-10">
          {isLoggedIn ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-300 font-bold text-xs flex-shrink-0 shadow-inner select-none">
                  {email.split("@")[0].substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-300 truncate">{email}</p>
                  <span className="text-[9px] text-slate-500 font-medium">Synced Profile</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all duration-200 cursor-pointer"
                  title="Profile & statistics"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <a
                  href="/logout"
                  className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-200 cursor-pointer"
                  title="Sign Out"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </a>
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
                  className="text-slate-400 hover:text-indigo-400 p-1 rounded-lg hover:bg-white/[0.04] transition-all duration-200 cursor-pointer"
                  title="Guest Statistics"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                </button>
              </div>
              <a
                href="/login"
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-600 rounded-xl py-2.5 transition-all duration-200 cursor-pointer shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-98"
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
      <main className="relative z-10 flex flex-col py-6 px-4 sm:px-6 md:px-8 max-w-2xl mx-auto w-full md:max-w-none md:h-screen md:overflow-hidden">
        
        {/* Header (Active list title + Progress) */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.04] pb-6">
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
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
                  className="text-2xl sm:text-3xl font-extrabold bg-transparent border-b-2 border-indigo-500 text-slate-100 focus:outline-none py-0.5 w-full font-display"
                  autoFocus
                />
                <button
                  onClick={handleTitleSubmit}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg p-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent cursor-pointer hover:opacity-85 select-none font-display truncate pr-2"
                  title="Click to rename list"
                >
                  {activeListName}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-indigo-400 p-1 rounded transition-all duration-200"
                  aria-label="Rename list inline"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {activeCount === 0 && totalTodos > 0
                ? "🎉 All tasks completed!"
                : `${activeCount} task${activeCount !== 1 ? "s" : ""} remaining`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 self-start sm:self-auto">
            <ProgressRing completed={completedCount} total={totalTodos} />
          </div>
        </header>

        {/* Create Task Form */}
        <createFetcher.Form
          method="post"
          className="mb-6"
          onSubmit={(e) => {
            if (reminderMode !== "none") {
              let timeMs = 0;
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
          }}
        >
          <input type="hidden" name="reminderAt" value="" />
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                name="text"
                required
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 shadow-inner px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
                placeholder="What needs to be done?"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <select
                  name="priority"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as "low" | "medium" | "high")}
                  className="h-full w-full rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-300 text-xs px-3 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200 cursor-pointer appearance-none bg-slate-900"
                >
                  <option value="low">🟢 Low Priority</option>
                  <option value="medium">🟡 Medium Priority</option>
                  <option value="high">🔴 High Priority</option>
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
                    ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
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
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/25 transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-98 flex items-center justify-center min-w-[70px]"
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
                  className="text-[10px] font-semibold text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Reminder
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("duration");
                    setReminderDuration(1);
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "duration" && reminderDuration === 1
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-200"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                    }`}
                >
                  ⏱ 1 Min
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("duration");
                    setReminderDuration(5);
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "duration" && reminderDuration === 5
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-200"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                    }`}
                >
                  ⏱ 5 Mins
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("duration");
                    setReminderDuration(15);
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "duration" && reminderDuration === 15
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-200"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                    }`}
                >
                  ⏱ 15 Mins
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("duration");
                    setReminderDuration(30);
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "duration" && reminderDuration === 30
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-200"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                    }`}
                >
                  ⏱ 30 Mins
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("duration");
                    setReminderDuration(60);
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "duration" && reminderDuration === 60
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-200"
                      : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-300"
                    }`}
                >
                  ⏱ 1 Hour
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setReminderMode("specific");
                    await requestNotificationPermission();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer
                    ${reminderMode === "specific"
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-200"
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
                    className="rounded-lg bg-slate-900 border border-white/[0.08] text-slate-300 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </createFetcher.Form>

        {/* Toolbar (Filters & Actions) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          {/* Filter button list */}
          <div className="flex gap-1 bg-white/[0.03] border border-white/[0.05] rounded-xl p-1 self-start">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                  ${filter === f.key
                    ? "bg-indigo-600/20 text-indigo-300 shadow-sm"
                    : "text-slate-500 hover:text-slate-350"
                  }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-50 font-bold">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 items-center self-end sm:self-auto">
            {completedCount > 0 && (
              <clearFetcher.Form method="post">
                <input type="hidden" name="intent" value="clearCompleted" />
                <button
                  type="submit"
                  className="text-xs text-slate-500 hover:text-rose-400 font-semibold transition-colors duration-200 cursor-pointer"
                >
                  Clear completed
                </button>
              </clearFetcher.Form>
            )}
            <button
              type="button"
              onClick={copyShareLink}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-300 font-semibold transition-colors duration-200 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Share List
            </button>
          </div>
        </div>

        {/* Todo List Area */}
        <div className="flex-1 min-h-0 mb-6 flex flex-col">
          {filteredTodos.length === 0 && totalTodos === 0 ? (
            <EmptyState />
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No {filter === "active" ? "active" : "completed"} tasks in this list.
            </div>
          ) : (
            <ul className="space-y-2 flex-1 overflow-y-auto pr-1 scrollbar-thin">
              {filteredTodos.map((todo) => (
                <TodoItem key={todo.id} todo={todo} />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto pt-6 border-t border-white/[0.04] text-center max-w-lg mx-auto w-full">
          <p className="text-slate-500 text-[11px] font-medium">
            sYnX • Sync your tasks. Execute your day.
          </p>
        </footer>
      </main>

      {/* ── Profile and Statistics Modal ─────────────────── */}
      {isProfileOpen && (
        <div
          onClick={() => setIsProfileOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center overflow-y-auto p-4 transition-all duration-300 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl p-6 relative overflow-hidden cursor-default"
          >
            {/* Glow design */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <button
              onClick={() => setIsProfileOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Profile Detail */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white font-extrabold text-xl shadow-xl shadow-indigo-500/10 mb-3 border border-white/10 relative">
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
                  className="text-slate-500 hover:text-indigo-400 transition-colors"
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
                <div className="text-lg font-extrabold text-indigo-400">{stats.totalLists}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Lists</div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-lg font-extrabold text-violet-400">{stats.totalTasks}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tasks</div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-lg font-extrabold text-fuchsia-400">
                  {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
                </div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Done</div>
              </div>
            </div>

            {/* Notification Settings */}
            {userId && (
              <div className="mb-6">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Notification Channels</h4>
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex flex-col gap-4 text-xs">
                  {/* Email Channel */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-300">Email Notifications</p>
                        {!isLoggedIn && (
                          <span className="text-[8px] bg-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider select-none">
                            Sign In Required
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {isLoggedIn ? `Receive alerts at ${email}` : "Get alerts sent to your email"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isLoggedIn}
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative disabled:opacity-50 disabled:cursor-not-allowed
                        ${emailEnabled && isLoggedIn ? "bg-indigo-600" : "bg-slate-800"}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                        ${emailEnabled && isLoggedIn ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <hr className="border-white/[0.04]" />

                  {/* SMS Channel */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-300">SMS Notifications</p>
                          {!isLoggedIn && (
                            <span className="text-[8px] bg-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider select-none">
                              Sign In Required
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">Receive text alerts</p>
                      </div>
                      <button
                        type="button"
                        disabled={!isLoggedIn}
                        onClick={() => setSmsEnabled(!smsEnabled)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none relative disabled:opacity-50 disabled:cursor-not-allowed
                          ${smsEnabled && isLoggedIn ? "bg-indigo-600" : "bg-slate-800"}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200
                          ${smsEnabled && isLoggedIn ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                    {smsEnabled && isLoggedIn && (
                      <div className="flex flex-col gap-2">
                        <div className="flex rounded-lg bg-slate-950 border border-white/[0.08] overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500/50">
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
                            className="w-full rounded-lg bg-slate-950 border border-white/[0.08] text-slate-400 text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none bg-slate-950"
                          >
                            <option value="">-- Mobile Carrier (Optional / Twilio) --</option>
                            <option value="verizon">Verizon</option>
                            <option value="att">AT&T</option>
                            <option value="tmobile">T-Mobile</option>
                            <option value="sprint">Sprint</option>
                            <option value="googlefi">Google Fi</option>
                            <option value="boost">Boost Mobile</option>
                            <option value="cricket">Cricket Wireless</option>
                            <option value="uscellular">US Cellular</option>
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
                          ${discordEnabled ? "bg-indigo-600" : "bg-slate-800"}`}
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
                        className="w-full text-xs rounded-lg bg-slate-950 border border-white/[0.08] text-slate-355 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
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
                    className="w-full mt-2 text-center text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl py-2.5 transition-all cursor-pointer shadow-md active:scale-[0.98]"
                  >
                    Save Preferences
                  </button>
                </div>
              </div>
            )}

            {/* Controls */}
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Options</h4>
            <div className="space-y-2">
              <button
                onClick={handleExportData}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] rounded-xl px-4 py-3 transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export All Lists (JSON)
                </span>
                <span className="text-[10px] text-slate-500">Download</span>
              </button>

              {isLoggedIn ? (
                <a
                  href="/logout"
                  className="w-full flex items-center justify-between text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </span>
                  <span className="text-[10px] text-rose-400/80">End Session</span>
                </a>
              ) : (
                <a
                  href="/login"
                  className="w-full flex items-center justify-between text-xs font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign In to Save Indefinitely
                  </span>
                  <span className="text-[10px] text-indigo-400/80">Persist Data</span>
                </a>
              )}
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
              className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200 mb-5"
              placeholder="Enter new list name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (renameInput.trim()) {
                    listFetcher.submit(
                      { intent: "renameList", listId: listToRename.id, newName: renameInput.trim() },
                      { method: "post" }
                    );
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
                    listFetcher.submit(
                      { intent: "renameList", listId: listToRename.id, newName: renameInput.trim() },
                      { method: "post" }
                    );
                  }
                  setListToRename(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition-all duration-200"
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
                  listFetcher.submit(
                    { intent: "deleteList", listId: listToDelete.id },
                    { method: "post" }
                  );
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
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-slate-200 mb-3 font-display">Create New List</h3>
            <input
              type="text"
              value={newListInput}
              onChange={(e) => setNewListInput(e.target.value)}
              className="w-full text-sm rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200 mb-5"
              placeholder="Enter list name (e.g., Shopping, Work)..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (newListInput.trim()) {
                    listFetcher.submit(
                      { intent: "createList", listName: newListInput.trim() } as any,
                      { method: "post" }
                    );
                  }
                  setNewListInput("");
                  setIsCreateListOpen(false);
                }
              }}
            />
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => {
                  setNewListInput("");
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
                    listFetcher.submit(
                      { intent: "createList", listName: newListInput.trim() } as any,
                      { method: "post" }
                    );
                  }
                  setNewListInput("");
                  setIsCreateListOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition-all duration-200"
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
