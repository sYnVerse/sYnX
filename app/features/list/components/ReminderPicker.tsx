import { useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { GUEST_REMINDER_HINT, GuestContext } from "~/guest-context";
import type { Todo } from "~/to-do-manager";
import { formatReminder } from "../format";

export function ReminderPicker({ todo }: { todo: Todo }) {
  const { isLoggedIn, canSetReminders, onGuestAction } = useContext(GuestContext);
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

  if (!canSetReminders) {
    return (
      <button
        type="button"
        disabled
        className="text-[10px] font-semibold flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-transparent text-slate-500 opacity-70 cursor-not-allowed"
        title={displayText ? `Reminder: ${displayText}. ${GUEST_REMINDER_HINT}.` : `${GUEST_REMINDER_HINT}.`}
        aria-label={displayText ? `Reminder: ${displayText}. ${GUEST_REMINDER_HINT}.` : `${GUEST_REMINDER_HINT}.`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {displayText && <span className="max-w-[5.5rem] truncate">{displayText}</span>}
      </button>
    );
  }

  return (
    <div ref={ref} className={`relative ${open ? "z-50" : ""}`}>
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
        <div className="absolute right-0 top-full mt-1 z-50 bg-themeSidebar backdrop-blur-xl border border-themeBorder rounded-lg shadow-2xl py-1 min-w-[140px] flex flex-col">
          <span className="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider select-none">Set Reminder</span>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-themeCardHover transition-colors"
            onClick={() => setDuration(1)}
          >
            ⏱ In 1 min
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-themeCardHover transition-colors"
            onClick={() => setDuration(5)}
          >
            ⏱ In 5 mins
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-themeCardHover transition-colors"
            onClick={() => setDuration(15)}
          >
            ⏱ In 15 mins
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-themeCardHover transition-colors"
            onClick={() => setDuration(30)}
          >
            ⏱ In 30 mins
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-themeCardHover transition-colors border-b border-themeBorder"
            onClick={() => setDuration(60)}
          >
            ⏱ In 1 hour
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-themeAccentText hover:bg-themeCardHover transition-colors"
            onClick={() => setCustomOpen(true)}
          >
            📅 Specific Time...
          </button>
          {displayText && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors border-t border-themeBorder"
              onClick={clearReminder}
            >
              ❌ Clear Reminder
            </button>
          )}
        </div>
      )}

      {customOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-themeSidebar border border-themeBorder rounded-xl shadow-2xl p-3 min-w-[200px]">
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
