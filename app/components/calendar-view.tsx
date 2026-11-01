import { useState, useMemo, useEffect, useRef, useContext } from "react";
import { useFetcher } from "@remix-run/react";
import type { Todo } from "~/to-do-manager";
import { GUEST_REMINDER_HINT, GuestContext } from "~/guest-context";
import { MAX_TASK_TEXT_LENGTH } from "~/write-limits";
import { canEditReminderText } from "~/reminder-ownership";
import { applySetCompletedLocal, formatRescheduledToast } from "../../shared";

// Redefining priority config for local styling
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

interface CalendarViewProps {
  todos: Todo[];
  activeListId: string;
  canEdit?: boolean;
  onNotify?: (message: string) => void;
}

export function CalendarView({ todos, activeListId, canEdit = true, onNotify }: CalendarViewProps) {
  const fetcher = useFetcher<{ success?: boolean; todo?: Todo; rescheduled?: boolean; error?: string }>();
  // Guests' own lists live in localStorage, so their changes go through
  // onGuestAction as well as the server (which ignores them). Guests on
  // someone else's shared list can't schedule tasks there.
  const { isLoggedIn, canSetReminders, onGuestAction } = useContext(GuestContext);
  
  // Navigation states
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Dialog / Modal states
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  // Drag & drop visual states
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [isDragOverUnscheduled, setIsDragOverUnscheduled] = useState(false);

  // Collapsible sidebar state on mobile
  const [isUnscheduledOpen, setIsUnscheduledOpen] = useState(true);

  const lastRescheduleToastKey = useRef<string | null>(null);
  const [flashCompleteId, setFlashCompleteId] = useState<string | null>(null);

  // Keep the optimistic values as primitives so the memo below only
  // recomputes when the pending toggle actually changes.
  const isPendingSetCompleted =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "setCompleted";
  const pendingCompleteId = isPendingSetCompleted ? String(fetcher.formData?.get("id") || "") : "";
  const pendingCompleted = isPendingSetCompleted && fetcher.formData?.get("completed") === "true";

  const displayTodos = useMemo(() => {
    if (!pendingCompleteId) return todos;
    return todos.map((t) => {
      if (t.id !== pendingCompleteId) return t;
      return applySetCompletedLocal(t, pendingCompleted).todo;
    });
  }, [todos, pendingCompleteId, pendingCompleted]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    const data = fetcher.data;
    if (!data) return;
    if (data.error) {
      onNotify?.(data.error);
      return;
    }
    if (data.rescheduled && data.todo?.reminderAt) {
      const key = `${data.todo.id}:${data.todo.reminderAt}`;
      if (lastRescheduleToastKey.current === key) return;
      lastRescheduleToastKey.current = key;
      setFlashCompleteId(data.todo.id);
      window.setTimeout(() => setFlashCompleteId(null), 450);
      onNotify?.(formatRescheduledToast(data.todo.reminderAt));
    }
  }, [fetcher.state, fetcher.data, onNotify]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Format month name
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  // Generate 42 calendar grid cells (6 weeks)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells = [];

    // Previous month's padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        dayNum: daysInPrevMonth - i,
        monthOffset: -1,
        isCurrentMonth: false,
        date: new Date(currentYear, currentMonth - 1, daysInPrevMonth - i),
      });
    }

    // Current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({
        dayNum: i,
        monthOffset: 0,
        isCurrentMonth: true,
        date: new Date(currentYear, currentMonth, i),
      });
    }

    // Next month's padding days (fill out remaining space up to 42 cells)
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        dayNum: i,
        monthOffset: 1,
        isCurrentMonth: false,
        date: new Date(currentYear, currentMonth + 1, i),
      });
    }

    return cells.map((cell) => {
      // Create local YYYY-MM-DD representation
      const y = cell.date.getFullYear();
      const m = String(cell.date.getMonth() + 1).padStart(2, "0");
      const d = String(cell.date.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      
      const today = new Date();
      const isToday = 
        y === today.getFullYear() && 
        cell.date.getMonth() === today.getMonth() && 
        cell.date.getDate() === today.getDate();

      return {
        ...cell,
        dateStr,
        isToday,
      };
    });
  }, [currentYear, currentMonth]);

  // Helper to convert timestamp to local YYYY-MM-DD string
  const getLocalDateString = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Categorize todos into Scheduled (group by day) and Unscheduled
  // Exclude subtasks (todos with parentId) from main rendering, as they render inside their parents
  const { scheduledMap, unscheduledList } = useMemo(() => {
    const sMap: Record<string, Todo[]> = {};
    const uList: Todo[] = [];

    displayTodos.forEach((todo) => {
      if (todo.parentId) return; // skip subtasks in main calendar rendering

      if (todo.reminderAt) {
        const dateStr = getLocalDateString(todo.reminderAt);
        if (!sMap[dateStr]) {
          sMap[dateStr] = [];
        }
        sMap[dateStr].push(todo);
      } else {
        uList.push(todo);
      }
    });

    // Sort scheduled items in each cell (completed items at the bottom, others by priority then date)
    Object.keys(sMap).forEach((dateStr) => {
      sMap[dateStr].sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        const pMap = { high: 3, medium: 2, low: 1, none: 0 };
        const aPri = a.priority ? pMap[a.priority] : 0;
        const bPri = b.priority ? pMap[b.priority] : 0;
        if (aPri !== bPri) return bPri - aPri;
        return a.createdAt - b.createdAt;
      });
    });

    return {
      scheduledMap: sMap,
      unscheduledList: uList,
    };
  }, [displayTodos]);

  // HTML5 Drag-and-drop drop handlers
  const handleDropOnDate = (todoId: string, dateStr: string) => {
    if (!canSetReminders) {
      onNotify?.(`${GUEST_REMINDER_HINT}.`);
      return;
    }
    const [year, month, day] = dateStr.split("-").map(Number);
    // Schedule for 9:00 AM on the target date in local time
    const targetDate = new Date(year, month - 1, day);
    targetDate.setHours(9, 0, 0, 0);

    if (!isLoggedIn) {
      onGuestAction("updateReminder", { id: todoId, reminderAt: targetDate.getTime() });
    }
    fetcher.submit(
      {
        intent: "updateReminder",
        id: todoId,
        reminderAt: targetDate.getTime().toString(),
      },
      { method: "post" }
    );
  };

  const handleDropOnUnscheduled = (todoId: string) => {
    if (!canSetReminders) {
      onNotify?.(`${GUEST_REMINDER_HINT}.`);
      return;
    }
    if (!isLoggedIn) {
      onGuestAction("updateReminder", { id: todoId, reminderAt: undefined });
    }
    fetcher.submit(
      {
        intent: "updateReminder",
        id: todoId,
        reminderAt: "", // Empty string clears it
      },
      { method: "post" }
    );
  };

  // Set explicit done state (idempotent); block while this task's request is in flight
  const handleToggleTodo = (todoId: string) => {
    if (pendingCompleteId === todoId) return;
    const current = todos.find((t) => t.id === todoId);
    if (!current) return;
    if (!isLoggedIn) {
      onGuestAction("setCompleted", { id: todoId, completed: !current.completed });
    }
    fetcher.submit(
      {
        intent: "setCompleted",
        id: todoId,
        completed: String(!current.completed),
      },
      { method: "post" }
    );
  };

  return (
    <div className="flex-1 flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,260px)] gap-6 min-h-0 h-full overflow-hidden min-w-0">
      
      {/* Main Calendar Panel */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-themeCard border border-themeBorder rounded-2xl p-4 shadow-sm">
        
        {/* Navigation & Title */}
        <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-themeBorder">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-themeBorder bg-white/[0.02] hover:bg-themeCardHover text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center"
              title="Previous Month"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-themeBorder bg-white/[0.02] hover:bg-themeCardHover text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center"
              title="Next Month"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 rounded-lg border border-themeBorder bg-white/[0.02] hover:bg-themeCardHover text-xs font-semibold text-slate-350 hover:text-white transition ml-1 cursor-pointer"
            >
              Today
            </button>
          </div>

          <h2 className="font-display font-bold text-base sm:text-lg text-slate-100 uppercase tracking-wide">
            {monthName} {currentYear}
          </h2>
        </div>

        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 border-b border-themeBorder pb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Day Grid */}
        <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-px bg-themeBorder rounded-xl overflow-hidden mt-1.5">
          {calendarCells.map(({ dayNum, isCurrentMonth, dateStr, isToday, date }) => {
            const dayTodos = scheduledMap[dateStr] || [];
            const isDragOver = dragOverCell === dateStr;

            return (
              <div
                key={dateStr}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverCell(dateStr);
                }}
                onDragLeave={() => setDragOverCell(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCell(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) handleDropOnDate(id, dateStr);
                }}
                className={`bg-slate-900/[0.1] p-1 flex flex-col min-h-0 relative group transition-all duration-200
                  ${isCurrentMonth ? "text-slate-200" : "text-slate-650 bg-slate-950/[0.3]"}
                  ${isToday ? "ring-1 ring-themeAccentRing/40 bg-themeAccentBg/5" : ""}
                  ${isDragOver ? "bg-themeAccentBg/15 ring-2 ring-themeAccentRing/60" : ""}
                `}
              >
                {/* Date Cell Header */}
                <div className="flex justify-between items-start mb-1 px-0.5">
                  <span
                    className={`text-[10px] font-semibold flex-shrink-0 select-none
                      ${isToday 
                        ? "bg-themeAccentBg text-themeAccentText px-1.5 py-0.5 rounded-md font-extrabold shadow-sm" 
                        : isCurrentMonth ? "text-slate-350" : "text-slate-600"}`}
                  >
                    {dayNum}
                  </span>
                  
                  {/* Plus button to quick-add (adds a dated task, so not for guests on shared lists) */}
                  {canSetReminders && (
                  <button
                    onClick={() => canEdit && setQuickAddDate(date)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-themeAccentText hover:bg-white/[0.04] p-0.5 rounded transition duration-150 cursor-pointer flex items-center justify-center"
                    title="Add task on this day"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  )}
                </div>

                {/* List of Tasks in this Date */}
                <div className="flex-1 overflow-y-auto pr-0.5 space-y-1 scrollbar-thin max-h-[85px] md:max-h-none">
                  {dayTodos.map((todo) => {
                    const cfg = priorityConfig[todo.priority || "none"];
                    
                    return (
                      <div
                        key={todo.id}
                        draggable={canEdit && canSetReminders}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", todo.id);
                        }}
                        className={`group/task flex items-center justify-between gap-1.5 px-1.5 py-1 rounded bg-slate-900/60 border border-white/5 hover:border-white/10 truncate cursor-grab active:cursor-grabbing hover:bg-white/[0.02] transition-colors
                          ${todo.completed ? "opacity-60" : ""}
                        `}
                        title={todo.text}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {/* Left priority border color strip */}
                          <span className={`w-1 h-3 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          
                          <button
                            type="button"
                            disabled={!canEdit || pendingCompleteId === todo.id}
                            aria-busy={pendingCompleteId === todo.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTodo(todo.id);
                            }}
                            className={`w-3.5 h-3.5 rounded border border-slate-700 flex items-center justify-center flex-shrink-0
                              ${pendingCompleteId === todo.id ? "cursor-default opacity-80" : "cursor-pointer"}
                              ${todo.completed || flashCompleteId === todo.id ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText" : "hover:border-themeAccentRing"}`}
                          >
                            {(todo.completed || flashCompleteId === todo.id) && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => canEdit && setEditingTodo(todo)}
                            className={`text-left text-[10px] md:text-xs truncate text-slate-355 group-hover/task:text-white cursor-pointer
                              ${todo.completed ? "line-through text-slate-500 italic" : ""}`}
                          >
                            {todo.text}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side Unscheduled Tasks Panel */}
      <div className="w-full md:w-[260px] md:min-w-0 flex flex-col min-h-0">
        
        {/* Toggle sidebar button (Mobile Only) */}
        <button
          onClick={() => setIsUnscheduledOpen(!isUnscheduledOpen)}
          className="md:hidden w-full flex items-center justify-between bg-themeCard border border-themeBorder p-3 rounded-xl mb-2 text-xs font-bold text-slate-350 cursor-pointer"
        >
          <span>📥 Unscheduled Tasks ({unscheduledList.length})</span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isUnscheduledOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isUnscheduledOpen && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragOverUnscheduled(true);
            }}
            onDragLeave={() => setIsDragOverUnscheduled(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOverUnscheduled(false);
              const id = e.dataTransfer.getData("text/plain");
              if (id) handleDropOnUnscheduled(id);
            }}
            className={`flex-1 flex flex-col min-h-0 bg-themeCard border border-themeBorder rounded-2xl p-4 shadow-sm transition-all duration-200
              ${isDragOverUnscheduled ? "bg-themeAccentBg/15 ring-2 ring-themeAccentRing/60" : ""}
            `}
          >
            <h3 className="hidden md:block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">
              📥 Unscheduled Tasks ({unscheduledList.length})
            </h3>
            
            <p className="text-[10px] text-slate-500 mb-4 px-1 leading-normal">
              {canSetReminders
                ? "Drag tasks from here onto calendar days to schedule them, or drag tasks back here to clear dates."
                : `${GUEST_REMINDER_HINT} or schedule tasks on shared lists.`}
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {unscheduledList.length === 0 ? (
                <div className="text-center py-8 text-slate-650 text-xs border border-dashed border-white/[0.04] rounded-xl bg-slate-900/[0.05]">
                  No unscheduled tasks.
                </div>
              ) : (
                unscheduledList.map((todo) => {
                  const cfg = priorityConfig[todo.priority || "none"];
                  
                  return (
                    <div
                      key={todo.id}
                      draggable={canSetReminders}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", todo.id);
                      }}
                      className="group flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] hover:bg-themeCardHover transition duration-200 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`w-1.5 h-4 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        
                        <button
                          type="button"
                          disabled={pendingCompleteId === todo.id}
                          aria-busy={pendingCompleteId === todo.id}
                          onClick={() => handleToggleTodo(todo.id)}
                          className={`w-4 h-4 rounded border border-slate-700 flex items-center justify-center flex-shrink-0
                            ${pendingCompleteId === todo.id ? "cursor-default opacity-80" : "cursor-pointer"}
                            ${todo.completed || flashCompleteId === todo.id ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText" : "hover:border-themeAccentRing"}`}
                        >
                          {(todo.completed || flashCompleteId === todo.id) && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingTodo(todo)}
                          className={`text-left text-xs truncate text-slate-350 group-hover:text-white cursor-pointer
                            ${todo.completed ? "line-through text-slate-600 italic" : ""}`}
                        >
                          {todo.text}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Task Modal */}
      {quickAddDate && (
        <QuickAddTaskModal
          date={quickAddDate}
          activeListId={activeListId}
          onClose={() => setQuickAddDate(null)}
        />
      )}

      {/* Edit Task Modal */}
      {editingTodo && (
        <EditTaskModal
          todo={editingTodo}
          onClose={() => setEditingTodo(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents for Modals
// ─────────────────────────────────────────────────────────────────────────────

interface QuickAddTaskModalProps {
  date: Date;
  activeListId: string;
  onClose: () => void;
}

function QuickAddTaskModal({ date, onClose }: QuickAddTaskModalProps) {
  const fetcher = useFetcher();
  const { isLoggedIn, onGuestAction } = useContext(GuestContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "none">("none");

  useEffect(() => {
    inputRef.current?.focus();
    
    // Close modal on escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    // Set reminder date to 9:00 AM on selected day
    const scheduledDate = new Date(date);
    scheduledDate.setHours(9, 0, 0, 0);

    if (!isLoggedIn) {
      onGuestAction("create", { text: text.trim(), priority, reminderAt: scheduledDate.getTime() });
    }
    fetcher.submit(
      {
        intent: "create",
        text: text.trim(),
        priority,
        reminderAt: scheduledDate.getTime().toString(),
      },
      { method: "post" }
    );
    onClose();
  };

  const formattedDateStr = date.toLocaleDateString("default", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Click outside to close */}
      <div role="presentation" className="absolute inset-0 cursor-default" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl z-10 flex flex-col gap-4 animate-fade-in animate-scale-up">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div>
            <h3 className="font-display font-extrabold text-sm text-slate-50">Quick Add Task</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Scheduled for: {formattedDateStr}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 hover:bg-white/[0.04] rounded-lg transition cursor-pointer flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quick-add-task-text" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Task Description</label>
            <input
              id="quick-add-task-text"
              ref={inputRef}
              type="text"
              required
              value={text}
              maxLength={MAX_TASK_TEXT_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Priority Level</span>
            <div className="grid grid-cols-4 gap-2">
              {(["none", "low", "medium", "high"] as const).map((p) => {
                const isSelected = priority === p;
                const cfg = priorityConfig[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`text-[10px] font-semibold py-2 rounded-lg border transition duration-200 cursor-pointer flex items-center justify-center gap-1.5
                      ${isSelected 
                        ? `bg-themeAccentBg border-themeAccentRing text-themeAccentText font-bold`
                        : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300"}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 mt-2 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-500 hover:text-slate-300 px-4 py-2 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs font-semibold bg-gradient-to-r from-themeAccentFrom to-themeAccentTo hover:from-themeAccentFrom hover:to-themeAccentTo text-white px-5 py-2.5 rounded-xl shadow-lg shadow-themeAccentFrom/10 hover:shadow-themeAccentFrom/25 transition cursor-pointer"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditTaskModalProps {
  todo: Todo;
  onClose: () => void;
}

function EditTaskModal({ todo, onClose }: EditTaskModalProps) {
  const fetcher = useFetcher();
  const { isLoggedIn, canSetReminders, currentUserId, listOwnerId, onGuestAction } = useContext(GuestContext);
  // Reminder text goes to the user who set the reminder, so guests or other
  // users on a shared list can't reword tasks with someone else's reminder.
  const canEditText =
    !todo.reminderAt || (canSetReminders && canEditReminderText(todo.reminderUserId, listOwnerId, currentUserId));
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState(todo.text);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "none">(todo.priority || "none");
  
  // Format local string for input datetime-local
  const getDatetimeInputValue = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d}T${hh}:${mm}`;
  };

  const [dateTime, setDateTime] = useState(() => getDatetimeInputValue(todo.reminderAt));

  useEffect(() => {
    inputRef.current?.focus();
    
    // Close modal on escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    // 1. Submit text update if changed
    if (canEditText && text.trim() !== todo.text) {
      if (!isLoggedIn) onGuestAction("updateText", { id: todo.id, text: text.trim() });
      fetcher.submit(
        { intent: "updateText", id: todo.id, text: text.trim() },
        { method: "post" }
      );
    }

    // 2. Submit priority update if changed
    if (priority !== todo.priority) {
      if (!isLoggedIn) onGuestAction("updatePriority", { id: todo.id, priority });
      fetcher.submit(
        { intent: "updatePriority", id: todo.id, priority },
        { method: "post" }
      );
    }

    // 3. Submit reminder date update if changed
    const currentReminderVal = todo.reminderAt ? getDatetimeInputValue(todo.reminderAt) : "";
    if (canSetReminders && dateTime !== currentReminderVal) {
      const targetTime = dateTime ? new Date(dateTime).getTime().toString() : "";
      if (!isLoggedIn) {
        onGuestAction("updateReminder", { id: todo.id, reminderAt: dateTime ? Number(targetTime) : undefined });
      }
      fetcher.submit(
        { intent: "updateReminder", id: todo.id, reminderAt: targetTime },
        { method: "post" }
      );
    }

    onClose();
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this task?")) {
      if (!isLoggedIn) onGuestAction("delete", { id: todo.id });
      fetcher.submit(
        { intent: "delete", id: todo.id },
        { method: "post" }
      );
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Click outside to close */}
      <div role="presentation" className="absolute inset-0 cursor-default" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl z-10 flex flex-col gap-4 animate-fade-in animate-scale-up">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <h3 className="font-display font-extrabold text-sm text-slate-50">Edit Task Details</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 hover:bg-white/[0.04] rounded-lg transition cursor-pointer flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-task-text" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Task Description</label>
            <input
              id="edit-task-text"
              ref={inputRef}
              type="text"
              required
              value={text}
              maxLength={MAX_TASK_TEXT_LENGTH}
              disabled={!canEditText}
              title={canEditText ? undefined : "Sign in to edit tasks that have reminders"}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 px-4 py-2.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Priority Level</span>
            <div className="grid grid-cols-4 gap-2">
              {(["none", "low", "medium", "high"] as const).map((p) => {
                const isSelected = priority === p;
                const cfg = priorityConfig[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`text-[10px] font-semibold py-2 rounded-lg border transition duration-200 cursor-pointer flex items-center justify-center gap-1.5
                      ${isSelected 
                        ? `bg-themeAccentBg border-themeAccentRing text-themeAccentText font-bold`
                        : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300"}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-task-reminder" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Due / Reminder Date & Time</label>
            <div className="flex gap-2">
              <input
                id="edit-task-reminder"
                type="datetime-local"
                value={dateTime}
                disabled={!canSetReminders}
                onChange={(e) => setDateTime(e.target.value)}
                className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {dateTime && canSetReminders && (
                <button
                  type="button"
                  onClick={() => setDateTime("")}
                  className="px-3 py-2 rounded-xl border border-white/[0.06] bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 hover:text-rose-400 text-xs font-semibold transition cursor-pointer"
                  title="Clear date (make unscheduled)"
                >
                  Clear Date
                </button>
              )}
            </div>
            {!canSetReminders && (
              <p className="text-[10px] text-slate-500">{GUEST_REMINDER_HINT} on shared lists.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 mt-2 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs font-semibold text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 px-3.5 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-semibold text-slate-500 hover:text-slate-350 px-4 py-2.5 rounded-xl transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                className="text-xs font-semibold bg-gradient-to-r from-themeAccentFrom to-themeAccentTo hover:from-themeAccentFrom hover:to-themeAccentTo text-white px-5 py-2.5 rounded-xl shadow-lg shadow-themeAccentFrom/10 hover:shadow-themeAccentFrom/25 transition cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
