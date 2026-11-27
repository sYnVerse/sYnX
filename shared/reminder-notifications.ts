export const REMINDER_NOTIFICATION_CATEGORY = "task_reminder";
export const REMINDER_ACTION_COMPLETE = "complete_task";
export const REMINDER_ACTION_SNOOZE = "snooze_task";

export const DEFAULT_REMINDER_SNOOZE_MINUTES = 10;
export const DEFAULT_REMINDER_SNOOZE_MS = DEFAULT_REMINDER_SNOOZE_MINUTES * 60 * 1000;
export const MIN_REMINDER_SNOOZE_MINUTES = 1;
export const MAX_REMINDER_SNOOZE_MINUTES = 1440;
export const REMINDER_SNOOZE_PRESET_MINUTES = [5, 10, 15, 30, 60] as const;

export const REMINDER_NOTIFICATION_ID_PREFIX = "reminder_";

export function isValidReminderSnoozeMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_REMINDER_SNOOZE_MINUTES &&
    value <= MAX_REMINDER_SNOOZE_MINUTES
  );
}

export function resolveReminderSnoozeMinutes(value: unknown): number {
  if (isValidReminderSnoozeMinutes(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (isValidReminderSnoozeMinutes(parsed)) {
        return parsed;
      }
    }
  }
  return DEFAULT_REMINDER_SNOOZE_MINUTES;
}

export function parseReminderSnoozeMinutesInput(
  value: unknown
): { ok: true; minutes: number | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, minutes: null };
  }
  if (isValidReminderSnoozeMinutes(value)) {
    return { ok: true, minutes: value };
  }
  return {
    ok: false,
    error: "Snooze duration must be a whole number of minutes between 1 and 1,440",
  };
}

export function parseCustomSnoozeMinutesInput(
  raw: string
): { ok: true; minutes: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (isValidReminderSnoozeMinutes(parsed)) {
      return { ok: true, minutes: parsed };
    }
  }
  return {
    ok: false,
    error: "Enter a whole number between 1 and 1,440 minutes",
  };
}

export function reminderSnoozeDurationMs(minutes?: number | null): number {
  return resolveReminderSnoozeMinutes(minutes) * 60 * 1000;
}

export function formatReminderSnoozeLabel(minutes?: number | null): string {
  const m = resolveReminderSnoozeMinutes(minutes);
  return m === 1 ? "1 min" : `${m} min`;
}

export function reminderNotificationIdentifier(todoId: string): string {
  return `${REMINDER_NOTIFICATION_ID_PREFIX}${todoId}`;
}

export function computeSnoozedReminderAt(
  now: number = Date.now(),
  durationMs: number = DEFAULT_REMINDER_SNOOZE_MS
): number {
  return now + durationMs;
}

export interface ReminderNotificationActionPayload {
  actionIdentifier: string;
  notificationId: string;
  todoId: string;
  listId?: string;
  recurrence?: string;
  title?: string;
  body?: string;
}

/**
 * Returns true when a task recurrence value represents a repeating schedule.
 */
export function isRepeatingTaskRecurrence(recurrence: unknown): boolean {
  return typeof recurrence === "string" && recurrence.length > 0 && recurrence !== "none";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Extracts normalized task reminder action details from either an interactive
 * `NotificationResponse` listener event or a background `TaskManager` payload.
 */
export function extractReminderNotificationActionPayload(
  rawEvent: unknown
): ReminderNotificationActionPayload | null {
  const root = asRecord(rawEvent);
  if (!root) return null;

  const event =
    typeof root.actionIdentifier === "string"
      ? root
      : asRecord(root.data);
  if (!event) return null;

  const actionIdentifier = nonEmptyString(event.actionIdentifier);
  if (
    actionIdentifier !== REMINDER_ACTION_COMPLETE &&
    actionIdentifier !== REMINDER_ACTION_SNOOZE
  ) {
    return null;
  }

  const notification = asRecord(event.notification);
  const request = asRecord(notification?.request);
  const content = asRecord(request?.content);
  const notificationId = typeof request?.identifier === "string" ? request.identifier : "";

  let data = asRecord(content?.data);
  if ((!data || !nonEmptyString(data.todoId)) && typeof content?.dataString === "string") {
    try {
      const parsed = asRecord(JSON.parse(content.dataString));
      if (parsed) {
        data = { ...(data ?? {}), ...parsed };
      }
    } catch {
      // Malformed dataString falls back to notification identifier below.
    }
  }

  let todoId = nonEmptyString(data?.todoId);
  if (!todoId && notificationId.startsWith(REMINDER_NOTIFICATION_ID_PREFIX)) {
    todoId = nonEmptyString(notificationId.slice(REMINDER_NOTIFICATION_ID_PREFIX.length));
  }
  if (!todoId) return null;

  const recurrence = nonEmptyString(data?.recurrence);

  return {
    actionIdentifier,
    notificationId,
    todoId,
    listId: nonEmptyString(data?.listId),
    ...(recurrence ? { recurrence } : {}),
    title: nonEmptyString(content?.title) ?? nonEmptyString(data?.title),
    body:
      nonEmptyString(content?.body) ??
      nonEmptyString(data?.message) ??
      nonEmptyString(data?.body),
  };
}

export type PendingNotificationOp =
  | {
      kind: "complete";
      todoId: string;
      listId?: string;
      completed: true;
      at: number;
    }
  | {
      kind: "snooze";
      todoId: string;
      listId?: string;
      reminderAt: number;
      title?: string;
      body?: string;
      at: number;
    };

export function extractPendingNotificationOps(raw: unknown): PendingNotificationOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: PendingNotificationOp[] = [];

  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item) continue;
    const todoId = nonEmptyString(item.todoId);
    const listId = nonEmptyString(item.listId);
    const at = typeof item.at === "number" && Number.isFinite(item.at) ? item.at : null;
    if (!todoId || at === null) continue;

    if (item.kind === "complete" && item.completed === true) {
      ops.push({
        kind: "complete",
        todoId,
        ...(listId ? { listId } : {}),
        completed: true,
        at,
      });
    } else if (
      item.kind === "snooze" &&
      typeof item.reminderAt === "number" &&
      Number.isFinite(item.reminderAt)
    ) {
      const title = nonEmptyString(item.title);
      const body = nonEmptyString(item.body);
      ops.push({
        kind: "snooze",
        todoId,
        ...(listId ? { listId } : {}),
        reminderAt: item.reminderAt,
        ...(title ? { title } : {}),
        ...(body ? { body } : {}),
        at,
      });
    }
  }

  return ops;
}

/**
 * Deduplicates pending notification actions by `todoId`, keeping the latest action.
 */
export function reconcilePendingNotificationOps(
  ops: readonly PendingNotificationOp[]
): PendingNotificationOp[] {
  if (!ops.length) return [];
  const sorted = [...ops].sort((a, b) => a.at - b.at);
  const byTodoId = new Map<string, PendingNotificationOp>();
  for (const op of sorted) {
    byTodoId.set(op.todoId, op);
  }
  return Array.from(byTodoId.values());
}

function sameNotificationOp(a: PendingNotificationOp, b: PendingNotificationOp): boolean {
  if (a.kind !== b.kind || a.todoId !== b.todoId || a.at !== b.at) {
    return false;
  }
  if (a.kind === "snooze" && b.kind === "snooze") {
    return a.reminderAt === b.reminderAt;
  }
  return true;
}

export function removeHandledNotificationOps(
  pendingOps: readonly PendingNotificationOp[],
  handled: readonly PendingNotificationOp[]
): PendingNotificationOp[] {
  if (!handled.length) return [...pendingOps];
  return pendingOps.filter((op) => !handled.some((h) => sameNotificationOp(op, h)));
}
