import type { RefObject } from "react";
import type { FetcherWithComponents } from "@remix-run/react";
import { GUEST_REMINDER_HINT, type GuestActionPayload } from "~/guest-context";
import { MAX_TASK_TEXT_LENGTH } from "~/write-limits";
import { requestNotificationPermission } from "../format";
import type { GuestList } from "../guest-lists";

interface CreateTaskFormProps {
  canEdit: boolean;
  isLoggedIn: boolean;
  isSharedServerList: boolean;
  activeListMeta?: GuestList;
  createFetcher: FetcherWithComponents<unknown>;
  inputRef: RefObject<HTMLInputElement | null>;
  isCreating: boolean;
  newPriority: "low" | "medium" | "high" | "none";
  setNewPriority: (priority: "low" | "medium" | "high" | "none") => void;
  newDurationMinutes: number | null;
  setNewDurationMinutes: (mins: number | null) => void;
  showDurationPicker: boolean;
  setShowDurationPicker: (show: boolean | ((prev: boolean) => boolean)) => void;
  reminderMode: "none" | "duration" | "specific";
  setReminderMode: (mode: "none" | "duration" | "specific") => void;
  reminderDuration: number;
  setReminderDuration: (mins: number) => void;
  reminderDateTime: string;
  setReminderDateTime: (dt: string) => void;
  showReminderPanel: boolean;
  setShowReminderPanel: (show: boolean | ((prev: boolean) => boolean)) => void;
  canSetReminders: boolean;
  handleGuestAction: (intent: string, payload?: GuestActionPayload) => void;
  showToast: (msg: string) => void;
}

export function CreateTaskForm({
  canEdit,
  isLoggedIn,
  isSharedServerList,
  activeListMeta,
  createFetcher,
  inputRef,
  isCreating,
  newPriority,
  setNewPriority,
  newDurationMinutes,
  setNewDurationMinutes,
  showDurationPicker,
  setShowDurationPicker,
  reminderMode,
  setReminderMode,
  reminderDuration,
  setReminderDuration,
  reminderDateTime,
  setReminderDateTime,
  showReminderPanel,
  setShowReminderPanel,
  canSetReminders,
  handleGuestAction,
  showToast,
}: CreateTaskFormProps) {
  if (!canEdit) {
    return (
      <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold">
          <span>👁 View-Only Access</span>
          <span className="text-indigo-400/70 font-normal">
            —{" "}
            {!isLoggedIn && isSharedServerList
              ? "Sign in to edit this list."
              : activeListMeta?.owner_display_name
              ? `Shared by ${activeListMeta.owner_display_name}. Editing is disabled.`
              : "You are viewing a shared list with read-only permissions."}
          </span>
        </div>
        {!isLoggedIn && isSharedServerList && (
          <a
            href="/login"
            className="text-xs font-semibold text-indigo-300 hover:text-white underline ml-2 shrink-0"
          >
            Sign in
          </a>
        )}
      </div>
    );
  }

  return (
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
            recurrence: "none",
            durationMinutes: newDurationMinutes ?? undefined,
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
            maxLength={MAX_TASK_TEXT_LENGTH}
            className="w-full min-w-0 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 shadow-inner px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 focus:border-themeAccentRing/50 transition-all duration-200"
            placeholder="What needs to be done?"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-initial min-w-[3rem]" title="Est. Duration in minutes">
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

          <div className="relative flex-1 sm:flex-initial min-w-[8.5rem]">
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
            disabled={!canSetReminders}
            onClick={async () => {
              if (!canSetReminders) return;
              setShowReminderPanel(!showReminderPanel);
              if (!showReminderPanel) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                  showToast("⚠️ Enable notifications to get alerts!");
                }
              }
            }}
            className={`rounded-xl border px-3.5 py-3 text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50
              ${reminderMode !== "none"
                ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText"
                : "bg-white/[0.04] border-white/[0.06] text-slate-400 hover:text-slate-200"
              }`}
            title={canSetReminders ? "Set Reminder Alert" : GUEST_REMINDER_HINT}
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
            className="rounded-xl bg-gradient-to-r from-themeAccentFrom to-themeAccentTo hover:from-themeAccentFrom hover:to-themeAccentTo text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-themeAccentFrom/10 hover:shadow-themeAccentFrom/25 transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-98 flex items-center justify-center min-w-[70px] grow sm:grow-0"
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

      {!canSetReminders && (
        <p className="mt-2 px-1 text-[10px] text-slate-500">
          {GUEST_REMINDER_HINT} on shared lists.
        </p>
      )}

      {showDurationPicker && (
        <div className="mt-2.5 p-3.5 rounded-xl bg-themeSidebar border border-themeBorder flex flex-col gap-2.5 animate-fade-in shadow-xl backdrop-blur-md">
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
                    ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-semibold"
                    : "bg-themeCard border-themeBorder text-slate-300 hover:bg-themeCardHover hover:text-white"
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
                className="w-16 px-2 py-1 rounded-lg bg-themeCard border border-themeBorder text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-themeAccentRing/50 text-center"
              />
            </div>
          </div>
        </div>
      )}

      {showReminderPanel && (
        <div className="mt-2.5 p-3.5 rounded-xl bg-themeSidebar border border-themeBorder flex flex-col gap-3 animate-fade-in shadow-xl backdrop-blur-md">
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
                    ? "bg-themeAccentBg border-themeAccentRing text-themeAccentText font-semibold"
                    : "bg-themeCard border-themeBorder text-slate-400 hover:bg-themeCardHover hover:text-slate-200"
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
  );
}
