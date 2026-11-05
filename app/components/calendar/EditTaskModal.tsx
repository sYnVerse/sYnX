import { useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { GUEST_REMINDER_HINT, GuestContext } from "~/guest-context";
import { canEditReminderText } from "~/reminder-ownership";
import { MAX_TASK_TEXT_LENGTH } from "~/write-limits";
import type { Todo } from "~/to-do-manager";
import { priorityConfig } from "~/features/list/format";

export interface EditTaskModalProps {
  todo: Todo;
  onClose: () => void;
}

export function EditTaskModal({ todo, onClose }: EditTaskModalProps) {
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
