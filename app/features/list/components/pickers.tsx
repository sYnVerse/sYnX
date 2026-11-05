import { useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { GuestContext } from "~/guest-context";
import { priorityConfig } from "../format";

export function PriorityPicker({
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
    <div ref={ref} className={`relative ${open ? "z-50" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border transition-all duration-200 cursor-pointer
          ${cfg.bg} ${cfg.color} ${cfg.border} hover:ring-2 ${cfg.ring}`}
      >
        {cfg.label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-themeSidebar backdrop-blur-xl border border-themeBorder rounded-lg shadow-2xl py-1 min-w-[90px]">
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

export function RecurrencePicker({
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
    <div ref={ref} className={`relative ${open ? "z-50" : ""}`}>
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
        <div className="absolute right-0 top-full mt-1 z-50 bg-themeSidebar backdrop-blur-xl border border-themeBorder rounded-lg shadow-2xl py-1 min-w-[100px] flex flex-col">
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

export function DurationPicker({
  currentDurationMinutes,
  todoId,
}: {
  currentDurationMinutes?: number | null;
  todoId: string;
}) {
  const { isLoggedIn, onGuestAction } = useContext(GuestContext);
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isFormSubmitting = fetcher.formData?.get("intent") === "updateDuration";
  const rawOpt = fetcher.formData?.get("durationMinutes");
  const optimisticDuration = isFormSubmitting
    ? (rawOpt !== null && rawOpt !== undefined && rawOpt !== "" ? Number(rawOpt) : null)
    : undefined;

  const displayDuration = optimisticDuration !== undefined ? optimisticDuration : (currentDurationMinutes ?? null);
  const hasDuration = displayDuration !== null && displayDuration !== undefined && !isNaN(displayDuration);

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
    <div ref={ref} className={`relative ${open ? "z-50" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-all duration-200 cursor-pointer
          ${hasDuration
            ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
            : "bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
          }`}
        title="Set Duration"
      >
        <span>⏱️</span>
        {hasDuration && <span>{displayDuration}m</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-themeSidebar border border-themeBorder rounded-xl shadow-2xl p-3 min-w-[160px] flex flex-col gap-2 animate-fade-in backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider select-none">Duration</span>
            {hasDuration && (
              <button
                type="button"
                className="text-[10px] font-semibold text-rose-400 hover:underline cursor-pointer bg-transparent"
                onClick={() => {
                  if (!isLoggedIn) {
                    onGuestAction("updateDuration", { id: todoId, durationMinutes: null });
                  }
                  fetcher.submit(
                    { intent: "updateDuration", id: todoId, durationMinutes: "" },
                    { method: "post" }
                  );
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[5, 15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all cursor-pointer ${
                  displayDuration === mins
                    ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-semibold"
                    : "bg-themeCard border-themeBorder text-slate-300 hover:bg-themeCardHover hover:text-white"
                }`}
                onClick={() => {
                  if (!isLoggedIn) {
                    onGuestAction("updateDuration", { id: todoId, durationMinutes: mins });
                  }
                  fetcher.submit(
                    { intent: "updateDuration", id: todoId, durationMinutes: String(mins) },
                    { method: "post" }
                  );
                  setOpen(false);
                }}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
