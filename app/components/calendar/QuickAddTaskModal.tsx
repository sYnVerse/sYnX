import { useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { GuestContext } from "~/guest-context";
import { MAX_TASK_TEXT_LENGTH } from "~/write-limits";
import { priorityConfig, requestNotificationPermission } from "~/features/list/format";
import type { PriorityLevel } from "../../../shared";
import {
  computeWebQuickAddState,
  formatLocalBaseDay,
} from "~/features/list/quick-add-form";

export interface QuickAddTaskModalProps {
  date: Date;
  activeListId: string;
  onClose: () => void;
}

export function QuickAddTaskModal({ date, onClose }: QuickAddTaskModalProps) {
  const fetcher = useFetcher();
  const { isLoggedIn, canSetReminders, onGuestAction } = useContext(GuestContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [dismissedTokens, setDismissedTokens] = useState<string[]>([]);
  const [manualPriority, setManualPriority] = useState<PriorityLevel | null>(null);
  const [now, setNow] = useState(0);

  const baseDay = formatLocalBaseDay(date);
  const quickState = computeWebQuickAddState({
    text,
    now: now || date.getTime(),
    baseDay,
    dismissed: dismissedTokens,
    manualPriority,
    manualDuration: undefined,
    manualReminderActive: false,
    canSetReminders,
  });

  useEffect(() => {
    inputRef.current?.focus();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (quickState.chips.length > 0) {
        e.preventDefault();
        const lastChip = quickState.chips[quickState.chips.length - 1];
        setDismissedTokens((prev) =>
          prev.includes(lastChip.dismissToken) ? prev : [...prev, lastChip.dismissToken]
        );
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, quickState.chips]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = (quickState.effectiveTitle || text.trim()).trim();
    if (!title) return;

    // Set reminder date to 9:00 AM on selected day when no date/time was parsed
    const scheduledDate = new Date(date);
    scheduledDate.setHours(9, 0, 0, 0);
    const reminderAt = canSetReminders
      ? quickState.parsedReminderAt ?? scheduledDate.getTime()
      : undefined;

    if (canSetReminders && quickState.parsedReminderAt !== null) {
      void requestNotificationPermission();
    }

    if (!isLoggedIn) {
      onGuestAction("create", {
        text: title,
        priority: quickState.effectivePriority,
        reminderAt,
        recurrence: quickState.effectiveRecurrence,
        durationMinutes: quickState.effectiveDurationMinutes ?? undefined,
      });
    }

    const submitData: Record<string, string> = {
      intent: "create",
      text: title,
      priority: quickState.effectivePriority,
      recurrence: quickState.effectiveRecurrence,
    };
    if (reminderAt !== undefined) {
      submitData.reminderAt = reminderAt.toString();
    }
    if (quickState.effectiveDurationMinutes !== null) {
      submitData.durationMinutes = quickState.effectiveDurationMinutes.toString();
    }
    fetcher.submit(submitData, { method: "post" });
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
              onChange={(e) => {
                setNow(Date.now());
                setText(e.target.value);
              }}
              placeholder="What needs to be done?"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 transition duration-200"
            />
            {quickState.chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Detected task details">
                {quickState.chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    data-testid="quick-add-chip"
                    data-chip-kind={chip.kind}
                    onClick={() =>
                      setDismissedTokens((prev) =>
                        prev.includes(chip.dismissToken) ? prev : [...prev, chip.dismissToken]
                      )
                    }
                    aria-label={`Dismiss detected detail ${chip.label}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-themeAccentBg border border-themeAccentRing text-themeAccentText px-2.5 py-0.5 text-[11px] font-semibold hover:opacity-85 transition cursor-pointer"
                  >
                    <span>{chip.label}</span>
                    <span aria-hidden="true" className="text-[11px] leading-none opacity-80">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Priority Level</span>
            <div className="grid grid-cols-4 gap-2">
              {(["none", "low", "medium", "high"] as const).map((p) => {
                const isSelected = quickState.effectivePriority === p;
                const cfg = priorityConfig[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setManualPriority(p)}
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
