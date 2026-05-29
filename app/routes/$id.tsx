import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect,
} from "@remix-run/cloudflare";
import { useLoaderData, useFetcher, useParams } from "@remix-run/react";
import { TodoManager } from "~/to-do-manager";
import { useState, useRef, useEffect, useCallback } from "react";
import { requireUser } from "~/auth.server";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const { userId, email } = await requireUser(request, context.cloudflare.env);
  if (params.id !== userId) {
    return redirect(`/${userId}`);
  }
  const todoManager = new TodoManager(
    context.cloudflare.env.TO_DO_LIST,
    params.id,
  );
  const todos = await todoManager.list();
  return { todos, email };
};

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { userId } = await requireUser(request, context.cloudflare.env);
  if (params.id !== userId) {
    return redirect(`/${userId}`);
  }
  const todoManager = new TodoManager(
    context.cloudflare.env.TO_DO_LIST,
    params.id,
  );
  const formData = await request.formData();
  const intent = formData.get("intent");

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

    default:
      return Response.json({ error: "Invalid intent" }, { status: 400 });
  }
}

type Filter = "all" | "active" | "completed";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: "low" | "medium" | "high";
}

// ─── Priority config ──────────────────────────────────────────
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

// ─── Empty State SVG ──────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 select-none">
      <svg
        className="w-32 h-32 mb-6 opacity-60"
        viewBox="0 0 128 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="24"
          y="20"
          width="80"
          height="96"
          rx="12"
          className="fill-slate-700/50 stroke-indigo-400/40"
          strokeWidth="2"
        />
        <rect
          x="36"
          y="40"
          width="36"
          height="4"
          rx="2"
          className="fill-indigo-400/50"
        />
        <rect
          x="36"
          y="52"
          width="48"
          height="4"
          rx="2"
          className="fill-slate-500/50"
        />
        <rect
          x="36"
          y="64"
          width="28"
          height="4"
          rx="2"
          className="fill-slate-500/50"
        />
        <rect
          x="36"
          y="76"
          width="42"
          height="4"
          rx="2"
          className="fill-slate-500/30"
        />
        <circle
          cx="92"
          cy="92"
          r="24"
          className="fill-indigo-500/20 stroke-indigo-400/50"
          strokeWidth="2"
        />
        <path
          d="M84 92L90 98L100 86"
          className="stroke-indigo-400"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h3
        className="text-xl font-semibold text-slate-300 mb-2"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        No tasks yet
      </h3>
      <p className="text-slate-500 text-sm text-center max-w-xs">
        Add your first task above to get started. Share the link with others to
        collaborate!
      </p>
    </div>
  );
}

// ─── Circular Progress ────────────────────────────────────────
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
          className="stroke-slate-700/60"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          className="stroke-indigo-400"
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

// ─── Toast ────────────────────────────────────────────────────
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
        bg-slate-800/90 backdrop-blur-lg text-indigo-200 border-indigo-500/30
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
    >
      {message}
    </div>
  );
}

// ─── Priority Picker (inline dropdown) ────────────────────────
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

  // Optimistic
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
        <div className="absolute right-0 top-full mt-1 z-40 bg-slate-800/95 backdrop-blur-xl border border-slate-700/60 rounded-lg shadow-2xl py-1 min-w-[90px]">
          {(["high", "medium", "low"] as const).map((p) => {
            const c = priorityConfig[p];
            return (
              <button
                key={p}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors hover:bg-slate-700/50 ${c.color}`}
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

// ─── Single Todo Item ─────────────────────────────────────────
function TodoItem({ todo }: { todo: Todo }) {
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  // Optimistic state
  const isToggling = toggleFetcher.formData?.get("intent") === "toggle";
  const isDeleting = deleteFetcher.formData?.get("intent") === "delete";
  const optimisticCompleted = isToggling ? !todo.completed : todo.completed;

  if (isDeleting) return null;

  return (
    <li
      className={`group flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-sm border border-white/[0.06] p-4 rounded-xl shadow-sm transition-all duration-300
        ${optimisticCompleted ? "opacity-60" : "opacity-100"}`}
    >
      {/* Toggle checkbox */}
      <toggleFetcher.Form method="post" className="flex-shrink-0">
        <input type="hidden" name="id" value={todo.id} />
        <input type="hidden" name="intent" value="toggle" />
        <button
          type="submit"
          className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 cursor-pointer
            border-slate-600 hover:border-indigo-400
            data-[checked=true]:bg-indigo-500 data-[checked=true]:border-indigo-500"
          data-checked={optimisticCompleted}
        >
          {optimisticCompleted && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="3"
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

      {/* Todo text */}
      <span
        className={`flex-1 text-sm transition-all duration-200 ${
          optimisticCompleted
            ? "line-through text-slate-500"
            : "text-slate-200"
        }`}
      >
        {todo.text}
      </span>

      {/* Priority badge */}
      <PriorityPicker currentPriority={todo.priority || "medium"} todoId={todo.id} />

      {/* Delete */}
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

// ─── Main Component ───────────────────────────────────────────
export default function TodoPage() {
  const { todos, email } = useLoaderData<typeof loader>();
  const params = useParams();
  const createFetcher = useFetcher();
  const clearFetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">(
    "medium",
  );
  const [toast, setToast] = useState({ message: "", visible: false });

  // Auto-clear input on successful submission
  const isCreating = createFetcher.state !== "idle";
  const prevIsCreating = useRef(isCreating);
  useEffect(() => {
    if (prevIsCreating.current && !isCreating) {
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    }
    prevIsCreating.current = isCreating;
  }, [isCreating]);

  // Compute optimistic todos (add pending create optimistically)
  const optimisticTodos: Todo[] = [...todos] as Todo[];

  // Filtering
  const filteredTodos = optimisticTodos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const totalTodos = optimisticTodos.length;
  const completedCount = optimisticTodos.filter((t) => t.completed).length;
  const activeCount = totalTodos - completedCount;

  // Share link copy
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

  const filterButtons: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalTodos },
    { key: "active", label: "Active", count: activeCount },
    { key: "completed", label: "Done", count: completedCount },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* ── Ambient gradient blobs ──────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-violet-600/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-fuchsia-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col py-8 px-4 sm:px-6">
        <div className="max-w-lg mx-auto w-full flex-1 flex flex-col">
          {/* ── Header ──────────────────────────────────────── */}
          <header className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1
                className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                To-Do List
              </h1>
              <div className="flex items-center gap-4">
                <a
                  href="/logout"
                  className="text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors border border-white/5 hover:border-rose-500/20 px-3 py-1.5 rounded-xl bg-white/5"
                >
                  Sign Out
                </a>
                <ProgressRing completed={completedCount} total={totalTodos} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <p>
                {activeCount === 0 && totalTodos > 0
                  ? "🎉 All tasks completed!"
                  : `${activeCount} task${activeCount !== 1 ? "s" : ""} remaining`}
              </p>
              <p className="opacity-80">
                Logged in as: <span className="text-indigo-400 font-medium">{email}</span>
              </p>
            </div>
          </header>

          {/* ── Create form ─────────────────────────────────── */}
          <createFetcher.Form
            method="post"
            className="mb-6"
          >
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  name="text"
                  required
                  className="w-full rounded-xl bg-white/[0.06] border border-white/[0.08] text-slate-200 placeholder-slate-500 shadow-inner px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
                  placeholder="What needs to be done?"
                  autoComplete="off"
                />
              </div>

              {/* Priority selector for new task */}
              <div className="flex items-center">
                <select
                  name="priority"
                  value={newPriority}
                  onChange={(e) =>
                    setNewPriority(
                      e.target.value as "low" | "medium" | "high",
                    )
                  }
                  className="h-full rounded-xl bg-white/[0.06] border border-white/[0.08] text-slate-300 text-xs px-2 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200 cursor-pointer appearance-none"
                >
                  <option value="low" className="bg-slate-800">
                    🟢 Low
                  </option>
                  <option value="medium" className="bg-slate-800">
                    🟡 Med
                  </option>
                  <option value="high" className="bg-slate-800">
                    🔴 High
                  </option>
                </select>
              </div>

              <button
                type="submit"
                name="intent"
                value="create"
                disabled={isCreating}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isCreating ? (
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  "Add"
                )}
              </button>
            </div>
          </createFetcher.Form>

          {/* ── Toolbar: filters + actions ───────────────────── */}
          <div className="flex items-center justify-between mb-4">
            {/* Filter tabs */}
            <div className="flex gap-1 bg-white/[0.04] rounded-lg p-1">
              {filterButtons.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all duration-200 cursor-pointer
                    ${
                      filter === f.key
                        ? "bg-indigo-500/20 text-indigo-300 shadow-sm"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                >
                  {f.label}
                  <span className="ml-1 opacity-60">{f.count}</span>
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {completedCount > 0 && (
                <clearFetcher.Form method="post">
                  <input type="hidden" name="intent" value="clearCompleted" />
                  <button
                    type="submit"
                    className="text-xs text-slate-500 hover:text-rose-400 transition-colors duration-200 cursor-pointer"
                  >
                    Clear done
                  </button>
                </clearFetcher.Form>
              )}
              <button
                type="button"
                onClick={copyShareLink}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-300 transition-colors duration-200 cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Share
              </button>
            </div>
          </div>

          {/* ── Todo list ───────────────────────────────────── */}
          {filteredTodos.length === 0 && totalTodos === 0 ? (
            <EmptyState />
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No {filter === "active" ? "active" : "completed"} tasks
            </div>
          ) : (
            <ul className="space-y-2 flex-1">
              {filteredTodos.map((todo) => (
                <TodoItem key={todo.id} todo={todo} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="max-w-lg mx-auto w-full mt-12 pt-6 border-t border-white/[0.06] text-center">
          <p className="text-slate-600 text-xs">
            Powered by{" "}
            <a
              href="https://christran.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400/70 hover:text-indigo-300 transition-colors duration-200 underline decoration-indigo-400/30 underline-offset-2"
            >
              ChrisTran.io
            </a>
          </p>
        </footer>
      </div>

      {/* ── Toast ────────────────────────────────────────── */}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
