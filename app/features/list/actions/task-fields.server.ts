import type { ListActionContext } from "./context";
import { taskTextError } from "~/write-limits";
import { canEditReminderText } from "~/reminder-ownership";

export async function handleUpdatePriority(ctx: ListActionContext) {
  const {
    formData,
    todoManager,
    scheduleActivityLog,
    activeListId,
    userId,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const priority = formData.get("priority") as "low" | "medium" | "high" | "none";
  await todoManager.updatePriority(id, priority);
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: "task_edited",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary: `Priority → ${priority}`,
  });
  return { success: true };
}

export async function handleUpdateText(ctx: ListActionContext) {
  const {
    formData,
    db,
    activeListId,
    isLoggedIn,
    userId,
    listOwnerId,
    todoManager,
    scheduleActivityLog,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const text = formData.get("text") as string;
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Invalid text" }, { status: 400 });
  }
  const textError = taskTextError(text.trim());
  if (textError) return Response.json({ error: textError }, { status: 400 });
  const previous = await db
    .prepare("SELECT text, reminder_at, reminder_user_id FROM todos WHERE id = ? AND list_id = ?")
    .bind(id, activeListId)
    .first<{ text: string; reminder_at: number | null; reminder_user_id: string | null }>();
  if (previous?.reminder_at != null) {
    if (!isLoggedIn) {
      // Reminder text goes to the user who set the reminder, so guests can't
      // reword a task that has a reminder.
      return Response.json({ error: "Sign in to edit tasks that have reminders." }, { status: 403 });
    }
    if (!canEditReminderText(previous.reminder_user_id, listOwnerId, userId)) {
      return Response.json({ error: "Only the user who set the reminder can edit this task's text." }, { status: 403 });
    }
  }
  await todoManager.updateText(id, text.trim());
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: "task_edited",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary:
      previous?.text && previous.text !== text.trim()
        ? `${previous.text} → ${text.trim()}`
        : text.trim(),
  });
  return { success: true };
}

export async function handleUpdateReminder(ctx: ListActionContext) {
  const {
    formData,
    todoManager,
    isLoggedIn,
    userId,
    scheduleActivityLog,
    activeListId,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const reminderAtVal = formData.get("reminderAt");
  const reminderAt = reminderAtVal ? Number(reminderAtVal) : undefined;
  await todoManager.updateReminder(id, reminderAt, isLoggedIn ? userId : null);
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: "task_edited",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary: reminderAt ? "Reminder set" : "Reminder cleared",
  });
  return { success: true };
}

export async function handleMarkReminderSent(ctx: ListActionContext) {
  const { formData, todoManager } = ctx;
  const id = formData.get("id") as string;
  await todoManager.markReminderSent(id);
  return { success: true };
}

export async function handleUpdateRecurrence(ctx: ListActionContext) {
  const {
    formData,
    todoManager,
    scheduleActivityLog,
    activeListId,
    userId,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const recurrence = formData.get("recurrence") as "none" | "daily" | "weekly" | "monthly";
  await todoManager.updateRecurrence(id, recurrence);
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: "task_edited",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary: `Repeat → ${recurrence}`,
  });
  return { success: true };
}

export async function handleUpdateDuration(ctx: ListActionContext) {
  const {
    formData,
    todoManager,
    scheduleActivityLog,
    activeListId,
    userId,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const durationMinutesVal = formData.get("durationMinutes");
  const durationMinutes = durationMinutesVal ? Number(durationMinutesVal) : null;
  await todoManager.updateDuration(id, durationMinutes);
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: "task_edited",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary:
      durationMinutes != null ? `Duration → ${durationMinutes}m` : "Duration cleared",
  });
  return { success: true };
}
