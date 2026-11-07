import { useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { GuestContext } from "~/guest-context";
import { canEditReminderText } from "~/reminder-ownership";
import { MAX_TASK_TEXT_LENGTH } from "~/write-limits";
import { applySetCompletedLocal, formatRescheduledToast, splitCompletedTasks } from "../../../../shared";
import type { Todo } from "~/to-do-manager";
import { ReminderPicker } from "./ReminderPicker";
import { DurationPicker, PriorityPicker, RecurrencePicker } from "./pickers";
import { CompletedSectionToggle } from "./CompletedSectionToggle";

export function renderHighlightedText(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let regex: RegExp;
  try {
    regex = new RegExp("(" + escaped + ")", "gi");
  } catch {
    return text;
  }
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  const lowerQuery = trimmed.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === lowerQuery ? (
      <mark
        key={i}
        className="bg-themeAccentFrom/20 text-themeAccentText font-semibold rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export interface TodoItemProps {
  todo: Todo;
  subtasks?: Todo[];
  isSubtask?: boolean;
  canEdit?: boolean;
  onNotify?: (message: string) => void;
  searchQuery?: string;
}

export function TodoItem({
  todo,
  subtasks = [],
  isSubtask = false,
  canEdit = true,
  onNotify,
  searchQuery = "",
}: TodoItemProps) {
  const { isLoggedIn, canSetReminders, currentUserId, listOwnerId, onGuestAction } = useContext(GuestContext);
  // A task's reminder text goes to the user who set the reminder, so guests or
  // other collaborators on a shared list can't reword someone else's reminder.
  const canEditText =
    canEdit &&
    (!todo.reminderAt || (canSetReminders && canEditReminderText(todo.reminderUserId, listOwnerId, currentUserId)));
  // On someone else's Collaborative list, deleting a task you didn't add (or
  // one with subtasks others added) sends a request the owner must approve.
  const deleteNeedsApproval =
    isLoggedIn && Boolean(listOwnerId) && listOwnerId !== currentUserId && !todo.canDeleteDirectly;
  const toggleFetcher = useFetcher<{ success?: boolean; todo?: Todo; rescheduled?: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{
    success?: boolean;
    pendingApproval?: boolean;
    message?: string;
    error?: string;
  }>();
  const subtaskFetcher = useFetcher();
  const editFetcher = useFetcher();

  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    const data = deleteFetcher.data;
    if (data.pendingApproval && data.message) {
      onNotify?.(data.message);
    } else if (data.error) {
      onNotify?.(data.error);
    }
  }, [deleteFetcher.state, deleteFetcher.data, onNotify]);

  const [showAddSubtask, setShowAddSubtask] = useState(false);
  // Completed subtasks sit in a section that starts collapsed and isn't remembered.
  const [showCompletedSubtasks, setShowCompletedSubtasks] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  // Reset the edit field when the saved text changes (e.g. after a save or a
  // revalidation). Adjusting state during render avoids an extra effect pass.
  const [syncedText, setSyncedText] = useState(todo.text);
  if (syncedText !== todo.text) {
    setSyncedText(todo.text);
    setEditText(todo.text);
  }
  const editInputRef = useRef<HTMLInputElement>(null);
  const [flashComplete, setFlashComplete] = useState(false);
  const lastRescheduleToastKey = useRef<string | null>(null);

  const isSetCompletedPending =
    toggleFetcher.state !== "idle" && toggleFetcher.formData?.get("intent") === "setCompleted";
  const desiredCompleted =
    isSetCompletedPending && toggleFetcher.formData
      ? toggleFetcher.formData.get("completed") === "true"
      : null;
  const optimistic =
    desiredCompleted !== null ? applySetCompletedLocal(todo, desiredCompleted) : { todo, rescheduled: false };
  const optimisticCompleted = optimistic.todo.completed;
  const isToggling = isSetCompletedPending;
  const isDeleting = deleteFetcher.formData?.get("intent") === "delete";

  const { active: activeSubtasks, completed: completedSubtasks } = splitCompletedTasks(subtasks);

  useEffect(() => {
    if (toggleFetcher.state !== "idle") return;
    const data = toggleFetcher.data;
    if (!data) return;
    if (data.error) {
      onNotify?.(data.error);
      return;
    }
    if (data.rescheduled && data.todo?.reminderAt) {
      const key = `${data.todo.id}:${data.todo.reminderAt}`;
      if (lastRescheduleToastKey.current === key) return;
      lastRescheduleToastKey.current = key;
      setFlashComplete(true);
      window.setTimeout(() => setFlashComplete(false), 450);
      onNotify?.(formatRescheduledToast(data.todo.reminderAt));
    }
  }, [toggleFetcher.state, toggleFetcher.data, onNotify]);

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
    if (!editText.trim() || !canEditText) return;
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
    <div className="flex flex-col w-full relative">
      <li
        className={`group flex flex-wrap lg:flex-nowrap items-center gap-x-2 gap-y-2 sm:gap-x-3 border transition-all duration-300 min-w-0 relative focus-within:z-40 hover:z-20
          ${isSubtask 
            ? "bg-transparent border-transparent py-1.5 px-2 hover:bg-white/[0.02] rounded-lg" 
            : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.04] p-3.5 rounded-xl shadow-sm"
          }
          ${optimisticCompleted || flashComplete ? "opacity-60" : "opacity-100"}`}
      >
        <toggleFetcher.Form
          method="post"
          className="flex-shrink-0"
          onSubmit={(e) => {
            if (!canEdit || isToggling) {
              e.preventDefault();
              return;
            }
            if (!isLoggedIn) {
              onGuestAction("setCompleted", { id: todo.id, completed: !todo.completed });
            }
          }}
        >
          <input type="hidden" name="id" value={todo.id} />
          <input type="hidden" name="intent" value="setCompleted" />
          <input type="hidden" name="completed" value={String(!todo.completed)} />
          <button
            type="submit"
            disabled={!canEdit || isToggling}
            aria-busy={isToggling}
            className={`rounded-md border-2 flex items-center justify-center transition-all duration-200 ${canEdit && !isToggling ? "cursor-pointer" : "cursor-default opacity-80"}
              ${isSubtask ? "w-4 h-4 border-slate-700" : "w-5 h-5 border-slate-700"}
              ${canEdit && !isToggling ? "hover:border-themeAccentFrom" : ""}
              data-[checked=true]:bg-themeAccentFrom data-[checked=true]:border-themeAccentFrom`}
            data-checked={optimisticCompleted || flashComplete}
          >
            {(optimisticCompleted || flashComplete) && (
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

        {isEditing && canEditText ? (
          <form onSubmit={handleEditSubmit} className="flex-1 flex items-center gap-2">
            <input
              ref={editInputRef}
              type="text"
              value={editText}
              maxLength={MAX_TASK_TEXT_LENGTH}
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
            className={`flex-1 min-w-0 break-words lg:truncate transition-all duration-200 ${canEditText ? "cursor-pointer hover:text-white" : "cursor-default"} ${
              isSubtask ? "text-xs text-slate-350" : "text-sm text-slate-200"
            } ${
              optimisticCompleted
                ? "line-through text-slate-500 italic opacity-50"
                : ""
            }`}
            title={todo.text}
            onDoubleClick={() => {
              if (!optimisticCompleted && canEditText) {
                setIsEditing(true);
              }
            }}
          >
            {renderHighlightedText(todo.text, searchQuery)}
          </span>
        )}

        {/* Badges and actions: their own wrapping row under the title on narrow
            screens, so they can't squeeze the title; inline on wide screens. */}
        <div
          className={`flex flex-wrap items-center gap-2 basis-full empty:hidden lg:basis-auto lg:flex-nowrap lg:shrink-0 lg:gap-3 lg:pl-0 ${
            isSubtask ? "pl-6 sm:pl-7" : "pl-7 sm:pl-8"
          }`}
        >
        {/* Duration Badge & Picker */}
        {canEdit && !optimisticCompleted ? (
          <DurationPicker currentDurationMinutes={todo.durationMinutes} todoId={todo.id} />
        ) : todo.durationMinutes ? (
          <span className="text-[10px] bg-themeAccentBg text-themeAccentText px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 border border-themeAccentRing/30">
            ⏱ {todo.durationMinutes}m
          </span>
        ) : null}

        {/* Recurrence Indicator (for parent tasks only) */}
        {!isSubtask && todo.recurrence && todo.recurrence !== "none" && (
          <span className="text-[9px] bg-themeAccentBg text-themeAccentText px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 border border-themeAccentText/20">
            🔄 {todo.recurrence}
          </span>
        )}

        {todo.pendingDelete && (
          <span
            className="text-[9px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-amber-400/25"
            title="Waiting for the list owner to approve deletion"
          >
            Delete requested
          </span>
        )}

        {canEdit && <PriorityPicker currentPriority={todo.priority || "none"} todoId={todo.id} />}
        {canEdit && !optimisticCompleted && !isSubtask && <ReminderPicker todo={todo} />}

        {/* Recurrence Picker dropdown (only for parent tasks) */}
        {canEdit && canSetReminders && !isSubtask && !optimisticCompleted && (
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

        {canEditText && !optimisticCompleted && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 text-slate-500 hover:text-themeAccentText transition-all duration-200 p-1 rounded-lg hover:bg-white/[0.04] cursor-pointer"
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

        {canEdit && !todo.pendingDelete && (
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
              className="lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 text-slate-500 hover:text-rose-400 transition-all duration-200 p-1 rounded-lg hover:bg-rose-500/10 cursor-pointer"
              aria-label={deleteNeedsApproval ? "Request delete (owner must approve)" : "Delete task"}
              title={deleteNeedsApproval ? "Request delete (owner must approve)" : "Delete task"}
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
        </div>
      </li>

      {/* Render subtasks underneath the parent */}
      {!isSubtask && (subtasks.length > 0 || showAddSubtask) && (
        <div className="pl-6 mt-1 flex flex-col gap-1 border-l border-white/[0.04] ml-5">
          {activeSubtasks.map((sub) => (
            <TodoItem
              key={sub.id}
              todo={sub}
              isSubtask={true}
              canEdit={canEdit}
              onNotify={onNotify}
              searchQuery={searchQuery}
            />
          ))}

          {/* Completed subtasks, collapsed by default */}
          {completedSubtasks.length > 0 && (
            <CompletedSectionToggle
              count={completedSubtasks.length}
              expanded={showCompletedSubtasks}
              onToggle={() => setShowCompletedSubtasks((open) => !open)}
              itemLabel="subtasks"
              isSubtask
            />
          )}
          {showCompletedSubtasks &&
            completedSubtasks.map((sub) => (
              <TodoItem
                key={sub.id}
                todo={sub}
                isSubtask={true}
                canEdit={canEdit}
                onNotify={onNotify}
                searchQuery={searchQuery}
              />
            ))}

          {/* Inline Add Subtask Input Form */}
          {showAddSubtask && (
            <form onSubmit={handleAddSubtask} className="flex items-center gap-2 py-1 px-2">
              <input
                ref={subtaskInputRef}
                type="text"
                value={subtaskText}
                maxLength={MAX_TASK_TEXT_LENGTH}
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
