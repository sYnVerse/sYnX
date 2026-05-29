import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect,
  json,
} from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { TodoManager, type Todo } from "~/to-do-manager";
import { useState, useRef, useEffect, useCallback } from "react";
import { getOptionalUser } from "~/auth.server";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const { userId, email, isLoggedIn, guestId, isNewGuest } = await getOptionalUser(request, context.cloudflare.env);
  const kv = context.cloudflare.env.TO_DO_LIST;

  const headers = new Headers();
  if (isNewGuest && guestId) {
    headers.append("Set-Cookie", `guest_session=${guestId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }

  // Load lists
  let lists: any = await kv.get(`user:${userId}:lists`, "json");

  // Migration logic
  if (!lists) {
    // Check if legacy tasks exist under userId (only if logged in)
    let legacyTodos: any = [];
    if (isLoggedIn) {
      const legacyManager = new TodoManager(kv, userId);
      legacyTodos = await legacyManager.list();
    }
    const defaultListId = crypto.randomUUID();
    const options = isLoggedIn ? {} : { expirationTtl: 86400 };

    if (legacyTodos && legacyTodos.length > 0) {
      // Migrate legacy tasks
      lists = [{ id: defaultListId, name: "My Tasks", createdAt: Date.now() }];
      await kv.put(`user:${userId}:lists`, JSON.stringify(lists), options);
      await kv.put(`list:${defaultListId}:meta`, JSON.stringify({ id: defaultListId, name: "My Tasks", ownerId: userId, createdAt: Date.now() }), options);
      await kv.put(`list:${defaultListId}:todos`, JSON.stringify(legacyTodos), options);
      
      // Delete legacy key to avoid re-migration
      await kv.delete(userId);
    } else {
      // Setup a fresh default list
      lists = [{ id: defaultListId, name: "My Tasks", createdAt: Date.now() }];
      await kv.put(`user:${userId}:lists`, JSON.stringify(lists), options);
      await kv.put(`list:${defaultListId}:meta`, JSON.stringify({ id: defaultListId, name: "My Tasks", ownerId: userId, createdAt: Date.now() }), options);
      await kv.put(`list:${defaultListId}:todos`, JSON.stringify([]), options);
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
      // Fallback if lists array is empty
      const defaultListId = crypto.randomUUID();
      lists = [{ id: defaultListId, name: "My Tasks", createdAt: Date.now() }];
      const options = isLoggedIn ? {} : { expirationTtl: 86400 };
      await kv.put(`user:${userId}:lists`, JSON.stringify(lists), options);
      await kv.put(`list:${defaultListId}:meta`, JSON.stringify({ id: defaultListId, name: "My Tasks", ownerId: userId, createdAt: Date.now() }), options);
      await kv.put(`list:${defaultListId}:todos`, JSON.stringify([]), options);
      return redirect(`/${defaultListId}`, { headers: isNewGuest && guestId ? headers : undefined });
    }
  }

  // Load todos for all lists to get detailed stats and active list's todos
  const listsWithTodos = await Promise.all(
    lists.map(async (list: any) => {
      const manager = new TodoManager(kv, `list:${list.id}:todos`, isLoggedIn ? undefined : 86400);
      const todos = await manager.list();
      return { ...list, todos };
    })
  );

  const activeList = listsWithTodos.find((l: any) => l.id === activeListId);
  const todos = activeList ? activeList.todos : [];

  const totalLists = listsWithTodos.length;
  let totalTasks = 0;
  let completedTasks = 0;
  for (const item of listsWithTodos) {
    totalTasks += item.todos.length;
    completedTasks += item.todos.filter((t: any) => t.completed).length;
  }

  const responsePayload = {
    userId,
    email,
    isLoggedIn,
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
  const { userId, isLoggedIn } = await getOptionalUser(request, context.cloudflare.env);
  const kv = context.cloudflare.env.TO_DO_LIST;
  const activeListId = params.id as string;

  // Check list ownership
  const lists: any = await kv.get(`user:${userId}:lists`, "json") || [];
  const hasOwnership = lists.some((l: any) => l.id === activeListId);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // For non-list creation actions, verify ownership of the active list
  if (intent !== "createList" && !hasOwnership) {
    return Response.json({ error: "Unauthorized access to list" }, { status: 403 });
  }

  const options = isLoggedIn ? {} : { expirationTtl: 86400 };
  const todoManager = new TodoManager(kv, `list:${activeListId}:todos`, isLoggedIn ? undefined : 86400);

  switch (intent) {
    case "create": {
      const text = formData.get("text");
      const priority =
        (formData.get("priority") as "low" | "medium" | "high") || "medium";
      if (typeof text !== "string" || !text)
        return Response.json({ error: "Invalid text" }, { status: 400 });
      
      await todoManager.create(text, priority);
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
      const newLists = [...lists, { id: newListId, name: listName.trim(), createdAt: Date.now() }];
      await kv.put(`user:${userId}:lists`, JSON.stringify(newLists), options);
      await kv.put(`list:${newListId}:meta`, JSON.stringify({ id: newListId, name: listName.trim(), ownerId: userId, createdAt: Date.now() }), options);
      await kv.put(`list:${newListId}:todos`, JSON.stringify([]), options);
      return redirect(`/${newListId}`);
    }

    case "renameList": {
      const listId = formData.get("listId") as string;
      const newName = formData.get("newName") as string;
      if (typeof newName !== "string" || !newName.trim()) {
        return Response.json({ error: "Invalid list name" }, { status: 400 });
      }
      const newLists = lists.map((l: any) => {
        if (l.id === listId) {
          return { ...l, name: newName.trim() };
        }
        return l;
      });
      await kv.put(`user:${userId}:lists`, JSON.stringify(newLists), options);
      await kv.put(`list:${listId}:meta`, JSON.stringify({ id: listId, name: newName.trim(), ownerId: userId, createdAt: Date.now() }), options);
      return { success: true };
    }

    case "deleteList": {
      const listId = formData.get("listId") as string;
      // Filter out the deleted list
      const newLists = lists.filter((l: any) => l.id !== listId);
      await kv.put(`user:${userId}:lists`, JSON.stringify(newLists), options);
      // Delete list data
      await kv.delete(`list:${listId}:meta`);
      await kv.delete(`list:${listId}:todos`);

      if (activeListId === listId) {
        if (newLists.length > 0) {
          return redirect(`/${newLists[0].id}`);
        } else {
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
            ? "line-through text-slate-550 italic opacity-50"
            : "text-slate-200"
        }`}
      >
        {todo.text}
      </span>

      <PriorityPicker currentPriority={todo.priority || "medium"} todoId={todo.id} />

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
  const { userId, email, isLoggedIn, lists, activeListId, todos, stats } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher();
  const clearFetcher = useFetcher();
  const listFetcher = useFetcher();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);
  
  const [filter, setFilter] = useState<Filter>("all");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [toast, setToast] = useState({ message: "", visible: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Custom modals state
  const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null);
  const [listToRename, setListToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListInput, setNewListInput] = useState("");

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
    downloadAnchor.setAttribute("download", `taskflow_backup_${userId}.json`);
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
    <div className="min-h-screen bg-slate-950 flex flex-col md:grid md:grid-cols-[280px_1fr] relative overflow-hidden font-sans">
      
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
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="font-extrabold text-lg text-slate-200 tracking-tight font-display">TaskFlow</span>
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
        className={`fixed md:sticky top-0 left-0 bottom-0 z-35 md:z-10 w-[280px] bg-slate-900 border-r border-white/[0.08] p-5 flex flex-col justify-between transition-transform duration-300 md:transform-none shadow-2xl md:shadow-none
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
            <span className="font-extrabold text-xl bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent tracking-tight font-display">TaskFlow</span>
          </div>

          {/* Add List Button */}
          <button
            onClick={() => setIsCreateListOpen(true)}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/25 hover:border-indigo-500/35 rounded-xl py-2.5 transition-all duration-200 mb-4 cursor-pointer"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New List
          </button>
          {isCreatingList && (
            <div className="text-[10px] text-slate-555 flex items-center gap-1.5 px-1 mb-4">
              <svg className="w-3.5 h-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating list...
            </div>
          )}

          {/* Lists Section */}
          <div className="flex-1 flex flex-col min-h-0">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">My Lists</h3>
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
                      <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-indigo-400" : "text-slate-650"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs font-semibold truncate">{list.name}</span>
                    </a>

                    <div className="flex items-center gap-1.5">
                      {remainingCount > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-slate-550"}`}>
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
                  className="text-slate-455 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all duration-200 cursor-pointer"
                  title="Profile & statistics"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31(2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <a
                  href="/logout"
                  className="text-slate-455 hover:text-rose-450 p-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-550/20 transition-all duration-200 cursor-pointer"
                  title="Sign Out"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
                  <span className="text-[10px] text-amber-450 font-bold uppercase tracking-wider">Unsaved Guest</span>
                </div>
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-slate-455 hover:text-indigo-400 p-1 rounded-lg hover:bg-white/[0.04] transition-all duration-200 cursor-pointer"
                  title="Guest Statistics"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                </button>
              </div>
              <a
                href="/login"
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-550 hover:from-indigo-455 hover:to-violet-500 rounded-xl py-2.5 transition-all duration-200 cursor-pointer shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-98"
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
      <main className="relative z-10 flex flex-col py-6 px-4 sm:px-6 md:px-8 max-w-2xl mx-auto w-full md:max-w-none">
        
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
        <createFetcher.Form method="post" className="mb-6">
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
                type="submit"
                name="intent"
                value="create"
                disabled={isCreating}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-550 hover:from-indigo-400 hover:to-violet-450 text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/25 transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-98 flex items-center justify-center min-w-[70px]"
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
                    ? "bg-indigo-650/20 text-indigo-300 shadow-sm"
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
        {filteredTodos.length === 0 && totalTodos === 0 ? (
          <EmptyState />
        ) : filteredTodos.length === 0 ? (
          <div className="text-center py-12 text-slate-550 text-xs">
            No {filter === "active" ? "active" : "completed"} tasks in this list.
          </div>
        ) : (
          <ul className="space-y-2 flex-1 min-h-[300px]">
            {filteredTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-white/[0.04] text-center max-w-lg mx-auto w-full">
          <p className="text-slate-650 text-[11px] font-medium">
            TaskFlow App • Syncs with secure auth server
          </p>
        </footer>
      </main>

      {/* ── Profile and Statistics Modal ─────────────────── */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl p-6 relative overflow-hidden">
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
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-550 flex items-center justify-center text-white font-extrabold text-xl shadow-xl shadow-indigo-500/10 mb-3 border border-white/10 relative">
                {email.split("@")[0].substring(0, 2).toUpperCase()}
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </div>
              <h3 className="text-base font-bold text-slate-200 font-display">{email}</h3>
              <div className="flex items-center gap-1.5 mt-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1">
                <span className="text-[10px] font-mono text-slate-450 select-all">User ID: {userId}</span>
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
                  className="w-full flex items-center justify-between text-xs font-semibold text-rose-450 hover:text-rose-350 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer"
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
                className="px-3.5 py-2 text-xs font-semibold text-slate-450 hover:text-slate-250 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
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
            <p className="text-xs text-slate-450 mb-5">
              Are you sure you want to delete <span className="text-rose-400 font-semibold">"{listToDelete.name}"</span>? This will permanently delete all tasks inside this list. This action is irreversible.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setListToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-450 hover:text-slate-250 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
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
                className="px-3.5 py-2 text-xs font-semibold text-slate-455 hover:text-slate-250 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-all duration-200"
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
