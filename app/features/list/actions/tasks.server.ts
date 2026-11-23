import type { ListActionContext } from "./context";
import { taskTextError, TASK_LIMIT_ERROR } from "~/write-limits";
import { GUEST_REMINDER_DENIAL, isListFull } from "~/guest-access.server";
import { getUserTimeZone } from "~/user-profile.server";
import { requestOrPerformDelete } from "~/pending-deletes.server";
import { deleteRequestActivitySummary } from "~/list-activity.server";
import { MAX_STAT_DURATION_SECONDS, setCompletionDuration } from "~/to-do-manager";

export async function handleCreateTask(ctx: ListActionContext) {
  const {
    formData,
    isLoggedIn,
    db,
    activeListId,
    todoManager,
    userId,
    hasOwnership,
    activeShareMode,
    scheduleActivityLog,
  } = ctx;
  const text = formData.get("text");
  const priority =
    (formData.get("priority") as "low" | "medium" | "high" | "none") || "none";
  const reminderAtVal = formData.get("reminderAt");
  const reminderAt = reminderAtVal ? Number(reminderAtVal) : undefined;
  const parentId = (formData.get("parentId") as string) || undefined;
  const recurrence = (formData.get("recurrence") as "none" | "daily" | "weekly" | "monthly") || "none";
  const durationMinutesVal = formData.get("durationMinutes");
  const durationMinutes = durationMinutesVal ? Number(durationMinutesVal) : null;

  if (typeof text !== "string" || !text)
    return Response.json({ error: "Invalid text" }, { status: 400 });
  const textError = taskTextError(text);
  if (textError) return Response.json({ error: textError }, { status: 400 });
  if (!isLoggedIn && (reminderAt !== undefined || recurrence !== "none")) {
    return Response.json({ error: GUEST_REMINDER_DENIAL }, { status: 403 });
  }
  if (parentId) {
    const parent = await db
      .prepare("SELECT 1 FROM todos WHERE id = ? AND list_id = ?")
      .bind(parentId, activeListId)
      .first();
    if (!parent) return Response.json({ error: "Parent task not found" }, { status: 400 });
  }
  if (await isListFull(db, activeListId)) {
    return Response.json({ error: TASK_LIMIT_ERROR }, { status: 400 });
  }

  const created = await todoManager.create(
    text,
    priority,
    reminderAt,
    parentId,
    recurrence,
    durationMinutes,
    isLoggedIn ? userId : null,
    isLoggedIn ? userId : null
  );
  scheduleActivityLog({
    listId: activeListId,
    taskId: created.id,
    action: "task_created",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary: text,
  });
  return { success: true };
}

export async function handleToggleTask(ctx: ListActionContext) {
  const {
    formData,
    db,
    activeListId,
    isLoggedIn,
    userId,
    todoManager,
    scheduleActivityLog,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const reminderRow = await db
    .prepare("SELECT reminder_user_id FROM todos WHERE id = ? AND list_id = ?")
    .bind(id, activeListId)
    .first<{ reminder_user_id: string | null }>();
  const tzUserId = reminderRow?.reminder_user_id || (isLoggedIn ? userId : "");
  const [timeZone, completerTimeZone] = await Promise.all([
    tzUserId ? getUserTimeZone(db, tzUserId) : undefined,
    isLoggedIn && userId !== tzUserId ? getUserTimeZone(db, userId) : undefined,
  ]);
  const todo = await todoManager.toggle(id, {
    timeZone,
    completerTimeZone: isLoggedIn && userId !== tzUserId ? (completerTimeZone ?? null) : timeZone,
    userId: isLoggedIn ? userId : undefined,
    isOwner: hasOwnership,
    source: "web",
  });
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: todo.completed || todo.rescheduled ? "task_completed" : "task_uncompleted",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary: todo.text,
  });
  return { success: true, todo };
}

export async function handleSetCompleted(ctx: ListActionContext) {
  const {
    formData,
    db,
    activeListId,
    isLoggedIn,
    userId,
    todoManager,
    scheduleActivityLog,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id");
  const completedRaw = formData.get("completed");
  const subtaskActionRaw = formData.get("subtaskAction");
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "Invalid task id" }, { status: 400 });
  }
  if (
    completedRaw !== "true" &&
    completedRaw !== "false" &&
    completedRaw !== "1" &&
    completedRaw !== "0"
  ) {
    return Response.json({ error: "Invalid completed state" }, { status: 400 });
  }
  let subtaskAction: "complete" | "promote" | undefined;
  if (subtaskActionRaw !== null && subtaskActionRaw !== "") {
    if (subtaskActionRaw !== "complete" && subtaskActionRaw !== "promote") {
      return Response.json({ error: "Invalid subtaskAction" }, { status: 400 });
    }
    subtaskAction = subtaskActionRaw;
  }
  const completed = completedRaw === "true" || completedRaw === "1";
  const reminderRow = await db
    .prepare("SELECT reminder_user_id FROM todos WHERE id = ? AND list_id = ?")
    .bind(id, activeListId)
    .first<{ reminder_user_id: string | null }>();
  const tzUserId = reminderRow?.reminder_user_id || (isLoggedIn ? userId : "");
  const [timeZone, completerTimeZone] = await Promise.all([
    tzUserId ? getUserTimeZone(db, tzUserId) : undefined,
    isLoggedIn && userId !== tzUserId ? getUserTimeZone(db, userId) : undefined,
  ]);
  const { todo, rescheduled, updatedSubtasks, completion } = await todoManager.setCompleted(id, completed, {
    timeZone,
    completerTimeZone: isLoggedIn && userId !== tzUserId ? (completerTimeZone ?? null) : timeZone,
    subtaskAction,
    userId: isLoggedIn ? userId : undefined,
    isOwner: hasOwnership,
    source: "web",
  });
  scheduleActivityLog({
    listId: activeListId,
    taskId: id,
    action: completed ? "task_completed" : "task_uncompleted",
    actorId: userId,
    isOwner: hasOwnership,
    shareMode: activeShareMode,
    summary: todo.text,
  });
  return {
    success: true,
    todo,
    rescheduled,
    updatedSubtasks: updatedSubtasks ?? [],
    completion: completion ?? null,
  };
}

export async function handleStartTask(ctx: ListActionContext) {
  const { formData, userId, todoManager } = ctx;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "Invalid task id" }, { status: 400 });
  }
  const rawStartedAt = formData.get("startedAt");
  const startedAt =
    typeof rawStartedAt === "string" && rawStartedAt.trim() !== ""
      ? Number(rawStartedAt)
      : undefined;
  if (startedAt !== undefined && !Number.isFinite(startedAt)) {
    return Response.json({ error: "Invalid startedAt timestamp" }, { status: 400 });
  }
  const todo = await todoManager.startTodo(id, userId, startedAt);
  return { success: true, todo };
}

export async function handleCancelStartTask(ctx: ListActionContext) {
  const { formData, todoManager } = ctx;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "Invalid task id" }, { status: 400 });
  }
  const todo = await todoManager.cancelStartTodo(id);
  return { success: true, todo };
}

export async function handleUndoRepeatTask(ctx: ListActionContext) {
  const {
    formData,
    activeListId,
    isLoggedIn,
    userId,
    todoManager,
    scheduleActivityLog,
    hasOwnership,
    activeShareMode,
  } = ctx;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "Invalid task id" }, { status: 400 });
  }
  const rawCompletionId = formData.get("completionId");
  const completionId =
    typeof rawCompletionId === "string" && rawCompletionId.trim() !== ""
      ? rawCompletionId.trim()
      : undefined;

  const { todo, undone } = await todoManager.undoRepeatCompletion(id, {
    completionId,
    userId: isLoggedIn ? userId : undefined,
    isOwner: hasOwnership,
  });

  if (undone) {
    scheduleActivityLog({
      listId: activeListId,
      taskId: id,
      action: "task_uncompleted",
      actorId: userId,
      isOwner: hasOwnership,
      shareMode: activeShareMode,
      summary: todo.text,
    });
  }

  return { success: true, todo, undone };
}

export async function handleSetCompletionDuration(ctx: ListActionContext) {
  const { isLoggedIn, formData, db, userId } = ctx;
  if (!isLoggedIn) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const completionId = formData.get("completionId");
  const rawDuration = formData.get("durationMinutes");
  if (typeof completionId !== "string" || !completionId.trim()) {
    return Response.json({ error: "Invalid completionId" }, { status: 400 });
  }
  const durationMinutes =
    typeof rawDuration === "string" && rawDuration.trim() !== ""
      ? Number(rawDuration)
      : NaN;
  const maxMinutes = MAX_STAT_DURATION_SECONDS / 60;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > maxMinutes) {
    return Response.json({ error: "Invalid durationMinutes" }, { status: 400 });
  }
  const completion = await setCompletionDuration(
    db,
    completionId.trim(),
    userId,
    durationMinutes
  );
  if (!completion) {
    return Response.json({ error: "Completion entry not found or already timed" }, { status: 404 });
  }
  return { success: true, completion };
}

export async function handleDeleteTask(ctx: ListActionContext) {
  const {
    formData,
    db,
    activeListId,
    userId,
    hasOwnership,
    isCollaborative,
    env,
    waitUntil,
    scheduleActivityLog,
    activeShareMode,
  } = ctx;
  const id = formData.get("id") as string;
  const existing = await db
    .prepare("SELECT text FROM todos WHERE id = ? AND list_id = ?")
    .bind(id, activeListId)
    .first<{ text: string }>();
  const result = await requestOrPerformDelete(db, {
    listId: activeListId,
    userId,
    isOwner: hasOwnership,
    canEdit: hasOwnership || isCollaborative,
    targetType: "task",
    targetId: id,
    env,
    waitUntil,
  });
  if (result.kind === "deleted" || result.kind === "requested") {
    scheduleActivityLog({
      listId: activeListId,
      taskId: id,
      action: result.kind === "requested" ? "delete_requested" : "task_deleted",
      actorId: userId,
      isOwner: hasOwnership,
      shareMode: activeShareMode,
      summary:
        result.kind === "requested"
          ? deleteRequestActivitySummary("task", existing?.text)
          : existing?.text,
    });
  }
  if (result.kind === "deleted") return { success: true };
  if (result.kind === "requested") {
    return {
      success: true,
      pendingApproval: true,
      alreadyRequested: result.alreadyExisted,
      message: result.message,
    };
  }
  if (result.kind === "not_found") {
    return Response.json({ error: result.error }, { status: 404 });
  }
  return Response.json({ error: result.error }, { status: 403 });
}

export async function handleClearCompleted(ctx: ListActionContext) {
  const {
    db,
    activeListId,
    userId,
    hasOwnership,
    isCollaborative,
    env,
    waitUntil,
    scheduleActivityLog,
    activeShareMode,
  } = ctx;
  const result = await requestOrPerformDelete(db, {
    listId: activeListId,
    userId,
    isOwner: hasOwnership,
    canEdit: hasOwnership || isCollaborative,
    targetType: "clear_completed",
    env,
    waitUntil,
  });
  if (result.kind === "requested" && result.deletedOwnCount) {
    // The collaborator's own completed tasks were cleared right away.
    scheduleActivityLog({
      listId: activeListId,
      action: "clear_completed",
      actorId: userId,
      isOwner: hasOwnership,
      shareMode: activeShareMode,
    });
  }
  if (result.kind === "deleted" || result.kind === "requested") {
    scheduleActivityLog({
      listId: activeListId,
      action: result.kind === "requested" ? "delete_requested" : "clear_completed",
      actorId: userId,
      isOwner: hasOwnership,
      shareMode: activeShareMode,
      summary:
        result.kind === "requested"
          ? deleteRequestActivitySummary("clear_completed")
          : undefined,
    });
  }
  if (result.kind === "deleted") return { success: true };
  if (result.kind === "requested") {
    return {
      success: true,
      pendingApproval: true,
      alreadyRequested: result.alreadyExisted,
      message: result.message,
    };
  }
  return Response.json({ error: result.error }, { status: 403 });
}
