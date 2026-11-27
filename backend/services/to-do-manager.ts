import {
  nextReminderAt,
  type CompletionExportRow,
  type CompletionSource,
  type TaskCompletionEntry,
  type TaskCompletionStats,
} from "@synx/shared";
import { isGuestId } from "./guest-access.server";

export const CLIENT_TIMESTAMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_STAT_DURATION_SECONDS = 12 * 60 * 60;
export const VOIDED_COMPLETIONS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface Todo {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  createdAt: number;
  priority: "low" | "medium" | "high" | "none";
  reminderAt?: number;
  reminderSent?: boolean;
  /** Signed-in user ID who created/set the reminder (falls back to list owner when omitted). */
  reminderUserId?: string;
  parentId?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  durationMinutes?: number;
  /** Epoch ms when the active timer was started (null/undefined when idle). */
  startedAt?: number;
  /** Signed-in user ID who started the active timer. */
  startedBy?: string;
  sortOrder?: number;
  /** Signed-in user who added the task (undefined for tasks added before this was recorded). */
  createdBy?: string;
  /** Collaborator delete request awaiting owner approval. */
  pendingDelete?: boolean;
  /** Caller's delete happens right away instead of becoming a delete request. */
  canDeleteDirectly?: boolean;
  rescheduled?: boolean;
}

export interface TodoRow {
  id: string;
  list_id: string;
  text: string;
  completed: number | boolean;
  created_at: number;
  priority: string | null;
  reminder_at: number | null;
  reminder_sent: number | boolean | null;
  reminder_user_id?: string | null;
  parent_id: string | null;
  recurrence: string | null;
  duration_minutes: number | null;
  started_at?: number | null;
  started_by?: string | null;
  sort_order?: number | null;
  created_by?: string | null;
}

export interface CompletionSummary {
  id: string;
  durationSeconds: number | null;
}

/** Clamps a client-supplied timestamp to `[serverNow - 24h, serverNow]`. */
export function clampClientTimestamp(
  ts: number | undefined | null,
  serverNow: number = Date.now()
): number {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return serverNow;
  }
  const rounded = Math.round(ts);
  const minTs = serverNow - CLIENT_TIMESTAMP_MAX_AGE_MS;
  return Math.min(serverNow, Math.max(minTs, rounded));
}

export async function pruneVoidedTaskCompletions(
  db: D1Database,
  now: number = Date.now()
): Promise<number> {
  const cutoff = now - VOIDED_COMPLETIONS_RETENTION_MS;
  const res = await db
    .prepare("DELETE FROM task_completions WHERE voided_at IS NOT NULL AND voided_at < ?")
    .bind(cutoff)
    .run();
  return Number((res as { meta?: { changes?: number } })?.meta?.changes) || 0;
}

interface TaskCompletionRow {
  id: string;
  todo_id: string;
  list_id: string;
  task_text: string;
  user_id: string;
  started_by: string | null;
  started_at: number | null;
  completed_at: number;
  duration_seconds: number | null;
  reminder_at: number | null;
  previous_reminder_sent: number | null;
  estimated_minutes: number | null;
  time_zone: string | null;
  source: string;
  op_id: string | null;
  voided_at: number | null;
}

/**
 * Resolves the `reminder_sent` flag when undoing a completion onto its prior `reminder_at`.
 * Preserves recorded `previousReminderSent` (0 or 1); if absent, treats already-elapsed
 * reminders (`<= now`) as already sent (1) so the cron never re-fires notifications.
 */
export function resolveRestoredReminderSent(
  reminderAt: number | null,
  previousReminderSent: number | null | undefined,
  now: number = Date.now()
): number {
  if (previousReminderSent === 0 || previousReminderSent === 1) {
    return previousReminderSent;
  }
  if (reminderAt !== null && Number.isFinite(reminderAt) && reminderAt <= now) {
    return 1;
  }
  return 0;
}

/**
 * Sets `duration_seconds` on an untimed, non-voided completion entry belonging to `userId`.
 * Returns null when the row does not exist, belongs to someone else, is voided, or already has a duration.
 */
export async function setCompletionDuration(
  db: D1Database,
  completionId: string,
  userId: string,
  durationMinutes: number
): Promise<{ id: string; todoId: string; listId: string; durationSeconds: number } | null> {
  const maxMinutes = MAX_STAT_DURATION_SECONDS / 60;
  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > maxMinutes
  ) {
    throw new Error(`Invalid durationMinutes: must be an integer between 1 and ${maxMinutes}`);
  }

  const row = await db
    .prepare(
      `SELECT id, todo_id, list_id, user_id, started_by, duration_seconds, voided_at
       FROM task_completions
       WHERE id = ?`
    )
    .bind(completionId)
    .first<{
      id: string;
      todo_id: string;
      list_id: string;
      user_id: string;
      started_by: string | null;
      duration_seconds: number | null;
      voided_at: number | null;
    }>();

  if (!row || row.voided_at != null || row.duration_seconds != null) {
    return null;
  }
  if ((row.started_by || row.user_id) !== userId) {
    return null;
  }

  const durationSeconds = Math.round(durationMinutes * 60);
  const res = await db
    .prepare(
      `UPDATE task_completions
       SET duration_seconds = ?
       WHERE id = ? AND voided_at IS NULL AND duration_seconds IS NULL`
    )
    .bind(durationSeconds, completionId)
    .run();

  if ((Number((res as { meta?: { changes?: number } })?.meta?.changes) || 0) === 0) {
    return null;
  }

  return {
    id: row.id,
    todoId: row.todo_id,
    listId: row.list_id,
    durationSeconds,
  };
}

/**
 * Loads non-voided completion rows attributed to `userId` (newest first) for CSV export.
 */
export async function getUserCompletionsForExport(
  db: D1Database,
  userId: string
): Promise<CompletionExportRow[]> {
  const { results } = await db
    .prepare(
      `SELECT tc.id, tc.todo_id, tc.list_id, l.name AS list_name, tc.task_text,
              tc.started_at, tc.completed_at, tc.duration_seconds, tc.estimated_minutes,
              tc.time_zone, tc.source
       FROM task_completions tc
       LEFT JOIN lists l ON l.id = tc.list_id
       WHERE tc.voided_at IS NULL
         AND COALESCE(tc.started_by, tc.user_id) = ?
       ORDER BY tc.completed_at DESC`
    )
    .bind(userId)
    .all<{
      id: string;
      todo_id: string;
      list_id: string;
      list_name: string | null;
      task_text: string;
      started_at: number | null;
      completed_at: number;
      duration_seconds: number | null;
      estimated_minutes: number | null;
      time_zone: string | null;
      source: string;
    }>();

  return (results || []).map((r) => ({
    id: r.id,
    todoId: r.todo_id,
    listId: r.list_id,
    listName: r.list_name ?? null,
    taskText: r.task_text,
    startedAt: r.started_at != null ? Number(r.started_at) : null,
    completedAt: Number(r.completed_at),
    durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
    estimatedMinutes: r.estimated_minutes != null ? Number(r.estimated_minutes) : null,
    timeZone: r.time_zone ?? null,
    source: r.source || "api",
  }));
}

/**
 * Summarizes completion timing stats from duration values ordered newest-first.
 * Null/missing values and outliers over 12 hours are omitted from duration metrics
 * while remaining counted in `count`.
 */
export function summarizeCompletionDurations(
  rawDurations: ReadonlyArray<number | null | undefined>,
  estimatedMinutes: number | null = null
): Omit<TaskCompletionStats, "entries"> {
  const timedDurations = rawDurations
    .map((d) => (d != null ? Number(d) : null))
    .filter(
      (d): d is number =>
        d !== null && Number.isFinite(d) && d >= 0 && d <= MAX_STAT_DURATION_SECONDS
    );

  let averageSeconds: number | null = null;
  let medianSeconds: number | null = null;
  if (timedDurations.length > 0) {
    const sum = timedDurations.reduce((acc, val) => acc + val, 0);
    averageSeconds = Math.round(sum / timedDurations.length);

    const sorted = [...timedDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianSeconds =
      sorted.length % 2 === 1
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  return {
    count: rawDurations.length,
    timedCount: timedDurations.length,
    averageSeconds,
    medianSeconds,
    lastDurationSeconds: timedDurations.length > 0 ? timedDurations[0] : null,
    estimatedMinutes,
  };
}

/**
 * Loads per-task completion timing summaries for every task in `listId`
 * scoped strictly to `callerUserId` (`COALESCE(started_by, user_id)`).
 */
export async function getListCompletionStats(
  db: D1Database,
  listId: string,
  callerUserId: string
): Promise<Record<string, TaskCompletionStats>> {
  const { results } = await db
    .prepare(
      `SELECT tc.todo_id, tc.duration_seconds, t.duration_minutes
       FROM task_completions tc
       INNER JOIN todos t ON t.id = tc.todo_id AND t.list_id = tc.list_id
       WHERE tc.list_id = ?
         AND tc.voided_at IS NULL
         AND COALESCE(tc.started_by, tc.user_id) = ?
       ORDER BY tc.completed_at DESC`
    )
    .bind(listId, callerUserId)
    .all<{
      todo_id: string;
      duration_seconds: number | null;
      duration_minutes: number | null;
    }>();

  const grouped = new Map<
    string,
    { durations: Array<number | null>; estimatedMinutes: number | null }
  >();
  for (const row of results || []) {
    let bucket = grouped.get(row.todo_id);
    if (!bucket) {
      bucket = {
        durations: [],
        estimatedMinutes:
          row.duration_minutes != null ? Number(row.duration_minutes) : null,
      };
      grouped.set(row.todo_id, bucket);
    }
    bucket.durations.push(
      row.duration_seconds != null ? Number(row.duration_seconds) : null
    );
  }

  const statsByTodoId: Record<string, TaskCompletionStats> = {};
  for (const [todoId, { durations, estimatedMinutes }] of grouped.entries()) {
    const summary = summarizeCompletionDurations(durations, estimatedMinutes);
    statsByTodoId[todoId] = {
      ...summary,
      entries: [],
    };
  }
  return statsByTodoId;
}

/**
 * Loads a task's completion history and timing statistics attributed to `callerUserId`.
 * Entries longer than 12 hours are kept in `entries` / `count` but excluded from
 * averages, medians, and `lastDurationSeconds`.
 */
export async function getTodoCompletions(
  db: D1Database,
  todoId: string,
  listId: string,
  callerUserId: string,
  limit = 20
): Promise<TaskCompletionStats> {
  const todoRow = await db
    .prepare("SELECT duration_minutes FROM todos WHERE id = ? AND list_id = ?")
    .bind(todoId, listId)
    .first<{ duration_minutes: number | null }>();
  if (!todoRow) {
    throw new Error(`Todo with id ${todoId} not found in this list`);
  }

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit || 20)));
  const { results } = await db
    .prepare(
      `SELECT * FROM task_completions
       WHERE todo_id = ?
         AND list_id = ?
         AND voided_at IS NULL
         AND COALESCE(started_by, user_id) = ?
       ORDER BY completed_at DESC`
    )
    .bind(todoId, listId, callerUserId)
    .all<TaskCompletionRow>();

  const rows = results || [];
  const summary = summarizeCompletionDurations(
    rows.map((r) => r.duration_seconds),
    todoRow.duration_minutes != null ? Number(todoRow.duration_minutes) : null
  );
  const entries: TaskCompletionEntry[] = rows.slice(0, safeLimit).map((r) => ({
    id: r.id,
    todoId: r.todo_id,
    listId: r.list_id,
    taskText: r.task_text,
    userId: r.user_id,
    startedBy: r.started_by ?? null,
    startedAt: r.started_at != null ? Number(r.started_at) : null,
    completedAt: Number(r.completed_at),
    durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
    estimatedMinutes: r.estimated_minutes != null ? Number(r.estimated_minutes) : null,
    timeZone: r.time_zone ?? null,
    source: (r.source || "api") as CompletionSource,
  }));

  return {
    ...summary,
    entries,
  };
}

export interface UserSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phoneNumber: string;
  phoneCarrier: string;
  discordWebhookUrl: string;
}

export interface PendingReminder {
  id: string;
  listId: string;
  listName?: string;
  text: string;
  reminderAt: number;
  userId: string;
  email?: string;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  phoneNumber?: string;
  phoneCarrier?: string;
  discordWebhookUrl?: string;
}

export class CompletionAttributionError extends Error {
  constructor(message = "Only the list owner or the user who completed this task can undo it.") {
    super(message);
    this.name = "CompletionAttributionError";
  }
}

export class TodoManager {
  private db: D1Database;
  private listId: string;
  private expirationTtl?: number;

  constructor(db: D1Database, listId: string, expirationTtl?: number) {
    this.db = db;
    this.listId = listId;
    this.expirationTtl = expirationTtl;
  }

  private assertRunSucceeded(result: unknown): void {
    if (
      result &&
      typeof result === "object" &&
      "success" in result &&
      (result as { success?: boolean }).success === false
    ) {
      throw new Error("D1 write operation failed");
    }
  }

  private async runBatch(statements: D1PreparedStatement[]): Promise<void> {
    if (statements.length === 0) return;
    if (typeof this.db.batch === "function") {
      const results = await this.db.batch(statements);
      for (const r of results) {
        this.assertRunSucceeded(r);
      }
      return;
    }
    for (const stmt of statements) {
      this.assertRunSucceeded(await stmt.run());
    }
  }

  /**
   * Helper to map DB row to Todo object
   */
  private mapRow(t: TodoRow): Todo {
    return {
      id: t.id,
      listId: t.list_id || this.listId,
      text: t.text,
      completed: Boolean(t.completed),
      createdAt: Number(t.created_at),
      priority: (t.priority || "none") as "low" | "medium" | "high" | "none",
      reminderAt: t.reminder_at ? Number(t.reminder_at) : undefined,
      reminderSent: t.reminder_sent !== null ? Boolean(t.reminder_sent) : undefined,
      reminderUserId: t.reminder_user_id || undefined,
      parentId: t.parent_id || undefined,
      recurrence: (t.recurrence || "none") as "none" | "daily" | "weekly" | "monthly",
      durationMinutes: t.duration_minutes !== null && t.duration_minutes !== undefined ? Number(t.duration_minutes) : undefined,
      startedAt: t.started_at !== null && t.started_at !== undefined ? Number(t.started_at) : undefined,
      startedBy: t.started_by || undefined,
      sortOrder: t.sort_order !== null && t.sort_order !== undefined ? Number(t.sort_order) : undefined,
      createdBy: t.created_by || undefined,
    };
  }

  /**
   * Starts a running timer for a task. If a timer is already running, keeps the
   * earlier `started_at` / `started_by` unchanged.
   */
  async startTodo(id: string, userId: string, startedAt?: number): Promise<Todo> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    if (todo.started_at !== null && todo.started_at !== undefined) {
      return this.mapRow(todo);
    }
    const isRecurring = Boolean(todo.recurrence && todo.recurrence !== "none");
    if (Boolean(todo.completed) && !isRecurring) {
      return this.mapRow(todo);
    }

    const effectiveStartedAt = clampClientTimestamp(startedAt, Date.now());
    this.assertRunSucceeded(
      await this.db
        .prepare(
          "UPDATE todos SET started_at = ?, started_by = ? WHERE id = ? AND list_id = ? AND started_at IS NULL AND (completed = 0 OR (recurrence IS NOT NULL AND recurrence != 'none'))"
        )
        .bind(effectiveStartedAt, userId, id, this.listId)
        .run()
    );
    const updated = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!updated) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(updated);
  }

  /** Clears a running task timer without completing the task. */
  async cancelStartTodo(id: string): Promise<Todo> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    this.assertRunSucceeded(
      await this.db
        .prepare("UPDATE todos SET started_at = NULL, started_by = NULL WHERE id = ? AND list_id = ?")
        .bind(id, this.listId)
        .run()
    );
    const updated = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!updated) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(updated);
  }

  /**
   * Retrieves all todos from storage
   * @returns Promise containing an array of Todo items, sorted by custom order then creation date (newest first)
   */
  async list(): Promise<Todo[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM todos WHERE list_id = ? ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, created_at DESC"
      )
      .bind(this.listId)
      .all<TodoRow>();
    return results.map((t) => this.mapRow(t));
  }

  /**
   * Creates a new todo item
   * @param text - The text content of the todo item
   * @param priority - The priority level of the todo item (defaults to "none")
   * @param reminderAt - Optional reminder timestamp (in ms)
   * @param parentId - Optional parent todo ID for subtasks
   * @param recurrence - Optional recurrence setting (defaults to "none")
   * @param durationMinutes - Optional estimated duration in minutes (defaults to null)
   * @param reminderUserId - Optional user ID who owns the reminder notification
   * @param createdBy - Signed-in user ID who added the task (null when unknown)
   * @returns Promise containing the newly created Todo item
   */
  async create(
    text: string,
    priority: "low" | "medium" | "high" | "none" = "none",
    reminderAt?: number | null,
    parentId?: string,
    recurrence: "none" | "daily" | "weekly" | "monthly" = "none",
    durationMinutes: number | null = null,
    reminderUserId?: string | null,
    createdBy?: string | null,
  ): Promise<Todo> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const effectiveReminderUserId = reminderAt ? (reminderUserId ?? null) : null;
    const minOrderRow = await this.db
      .prepare(
        parentId
          ? "SELECT MIN(sort_order) AS min_order FROM todos WHERE list_id = ? AND parent_id = ?"
          : "SELECT MIN(sort_order) AS min_order FROM todos WHERE list_id = ? AND parent_id IS NULL"
      )
      .bind(...(parentId ? [this.listId, parentId] : [this.listId]))
      .first<{ min_order: number | null }>();
    const sortOrder =
      minOrderRow?.min_order !== null && minOrderRow?.min_order !== undefined
        ? Number(minOrderRow.min_order) - 1
        : 0;

    await this.db
      .prepare(
        "INSERT INTO todos (id, list_id, text, completed, created_at, priority, reminder_at, reminder_sent, reminder_user_id, parent_id, recurrence, duration_minutes, created_by, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        this.listId,
        text,
        0,
        createdAt,
        priority === "none" ? null : priority,
        reminderAt ?? null,
        reminderAt ? 0 : null,
        effectiveReminderUserId,
        parentId ?? null,
        recurrence,
        durationMinutes,
        createdBy ?? null,
        sortOrder
      )
      .run();
    return {
      id,
      listId: this.listId,
      text,
      completed: false,
      createdAt,
      priority,
      reminderAt: reminderAt || undefined,
      reminderSent: reminderAt ? false : undefined,
      reminderUserId: effectiveReminderUserId || undefined,
      parentId,
      recurrence,
      durationMinutes: durationMinutes !== null && durationMinutes !== undefined ? durationMinutes : undefined,
      sortOrder,
      createdBy: createdBy || undefined,
    };
  }

  private prepareCompletionInsert(params: {
    todo: TodoRow;
    userId: string;
    completedAt: number;
    timeZone?: string;
    source: CompletionSource;
    opId: string | null;
  }): { stmt: D1PreparedStatement; summary: CompletionSummary } {
    const completionId = crypto.randomUUID();
    const startedAt =
      params.todo.started_at !== null && params.todo.started_at !== undefined
        ? Number(params.todo.started_at)
        : null;
    const startedBy = startedAt !== null ? (params.todo.started_by || params.userId) : null;
    const durationSeconds =
      startedAt !== null
        ? Math.max(0, Math.round((params.completedAt - startedAt) / 1000))
        : null;
    const prevReminderAt =
      params.todo.reminder_at !== null && params.todo.reminder_at !== undefined
        ? Number(params.todo.reminder_at)
        : null;
    const prevReminderSent =
      params.todo.reminder_sent !== null && params.todo.reminder_sent !== undefined
        ? Number(params.todo.reminder_sent)
        : null;
    const estimatedMinutes =
      params.todo.duration_minutes !== null && params.todo.duration_minutes !== undefined
        ? Number(params.todo.duration_minutes)
        : null;

    const stmt = this.db
      .prepare(
        `INSERT INTO task_completions (
          id, todo_id, list_id, task_text, user_id, started_by, started_at,
          completed_at, duration_seconds, reminder_at, previous_reminder_sent,
          estimated_minutes, time_zone, source, op_id, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        completionId,
        params.todo.id,
        this.listId,
        params.todo.text,
        params.userId,
        startedBy,
        startedAt,
        params.completedAt,
        durationSeconds,
        prevReminderAt,
        prevReminderSent,
        estimatedMinutes,
        params.timeZone ?? null,
        params.source,
        params.opId
      );

    return {
      stmt,
      summary: { id: completionId, durationSeconds },
    };
  }

  /**
   * Sets the completed status of a todo to an explicit value (idempotent).
   * Recurring tasks marked done advance the reminder and stay uncompleted.
   * Logs signed-in completions into `task_completions` atomically with `db.batch`,
   * supporting client `opId` idempotency and undo voiding/timer restore.
   */
  async setCompleted(
    id: string,
    completed: boolean,
    options: {
      timeZone?: string;
      completerTimeZone?: string | null;
      subtaskAction?: "complete" | "promote";
      userId?: string;
      isOwner?: boolean;
      completedAt?: number;
      source?: CompletionSource;
      opId?: string;
    } = {}
  ): Promise<{
    todo: Todo;
    rescheduled: boolean;
    updatedSubtasks?: Todo[];
    completion?: CompletionSummary | null;
  }> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }

    const opId = options.opId?.trim() || null;
    if (opId) {
      const existing = await this.db
        .prepare("SELECT id, duration_seconds FROM task_completions WHERE op_id = ?")
        .bind(opId)
        .first<{ id: string; duration_seconds: number | null }>();
      if (existing) {
        return {
          todo: this.mapRow(todo),
          rescheduled: false,
          completion: {
            id: existing.id,
            durationSeconds:
              existing.duration_seconds !== null && existing.duration_seconds !== undefined
                ? Number(existing.duration_seconds)
                : null,
          },
        };
      }
    }

    const serverNow = Date.now();
    const canLog = Boolean(options.userId && !isGuestId(options.userId));
    const currentlyCompleted = Boolean(todo.completed);
    const recurrence = todo.recurrence as string | undefined;
    const isRecurring = Boolean(recurrence && recurrence !== "none");
    const effectiveCompletedAt = clampClientTimestamp(options.completedAt, serverNow);
    const completionTimeZone =
      options.completerTimeZone !== undefined
        ? (options.completerTimeZone ?? undefined)
        : options.timeZone;
    const source: CompletionSource = options.source ?? "api";

    const executeBatchIdempotent = async (
      stmts: D1PreparedStatement[],
      pendingCompletion: CompletionSummary | null
    ): Promise<CompletionSummary | null | "idempotent_hit"> => {
      try {
        await this.runBatch(stmts);
        return pendingCompletion;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opId && /UNIQUE constraint failed.*op_id/i.test(msg)) {
          return "idempotent_hit";
        }
        throw err;
      }
    };

    if (completed && isRecurring) {
      const currentReminder = todo.reminder_at ? Number(todo.reminder_at) : serverNow;
      const nextReminder = nextReminderAt(currentReminder, String(recurrence), options.timeZone);

      const stmts: D1PreparedStatement[] = [
        this.db
          .prepare(
            "UPDATE todos SET reminder_at = ?, reminder_sent = 0, completed = 0, started_at = NULL, started_by = NULL WHERE id = ? AND list_id = ?"
          )
          .bind(nextReminder, id, this.listId),
      ];
      let pendingCompletion: CompletionSummary | null = null;
      if (canLog && options.userId) {
        const prepared = this.prepareCompletionInsert({
          todo,
          userId: options.userId,
          completedAt: effectiveCompletedAt,
          timeZone: completionTimeZone,
          source,
          opId,
        });
        stmts.push(prepared.stmt);
        pendingCompletion = prepared.summary;
      }

      const batchOutcome = await executeBatchIdempotent(stmts, pendingCompletion);
      const updated = await this.db
        .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
        .bind(id, this.listId)
        .first<TodoRow>();
      if (!updated) {
        throw new Error(`Todo with id ${id} not found in this list`);
      }
      if (batchOutcome === "idempotent_hit" && opId) {
        const existing = await this.db
          .prepare("SELECT id, duration_seconds FROM task_completions WHERE op_id = ?")
          .bind(opId)
          .first<{ id: string; duration_seconds: number | null }>();
        return {
          todo: this.mapRow(updated),
          rescheduled: false,
          completion: existing
            ? {
                id: existing.id,
                durationSeconds:
                  existing.duration_seconds !== null && existing.duration_seconds !== undefined
                    ? Number(existing.duration_seconds)
                    : null,
              }
            : null,
        };
      }
      return {
        todo: this.mapRow(updated),
        rescheduled: true,
        completion: batchOutcome === "idempotent_hit" ? null : batchOutcome,
      };
    }

    let completionSummary: CompletionSummary | null = null;
    if (currentlyCompleted !== Boolean(completed)) {
      if (completed) {
        const stmts: D1PreparedStatement[] = [
          this.db
            .prepare(
              "UPDATE todos SET completed = 1, started_at = NULL, started_by = NULL WHERE id = ? AND list_id = ?"
            )
            .bind(id, this.listId),
        ];
        let pendingCompletion: CompletionSummary | null = null;
        if (canLog && options.userId) {
          const prepared = this.prepareCompletionInsert({
            todo,
            userId: options.userId,
            completedAt: effectiveCompletedAt,
            timeZone: completionTimeZone,
            source,
            opId,
          });
          stmts.push(prepared.stmt);
          pendingCompletion = prepared.summary;
        }
        const batchOutcome = await executeBatchIdempotent(stmts, pendingCompletion);
        if (batchOutcome === "idempotent_hit" && opId) {
          const existing = await this.db
            .prepare("SELECT id, duration_seconds FROM task_completions WHERE op_id = ?")
            .bind(opId)
            .first<{ id: string; duration_seconds: number | null }>();
          const current = await this.db
            .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
            .bind(id, this.listId)
            .first<TodoRow>();
          return {
            todo: this.mapRow(current ?? todo),
            rescheduled: false,
            completion: existing
              ? {
                  id: existing.id,
                  durationSeconds:
                    existing.duration_seconds !== null && existing.duration_seconds !== undefined
                      ? Number(existing.duration_seconds)
                      : null,
                }
              : null,
          };
        }
        completionSummary = batchOutcome === "idempotent_hit" ? null : batchOutcome;
      } else {
        // Undo of a completed one-time task: void latest completion row and restore timer.
        const latest = await this.db
          .prepare(
            `SELECT id, user_id, started_at, started_by
             FROM task_completions
             WHERE todo_id = ? AND list_id = ? AND voided_at IS NULL
             ORDER BY completed_at DESC
             LIMIT 1`
          )
          .bind(id, this.listId)
          .first<{ id: string; user_id: string; started_at: number | null; started_by: string | null }>();

        if (latest) {
          const attributedUserId = latest.started_by || latest.user_id;
          if (!options.isOwner && (!options.userId || attributedUserId !== options.userId)) {
            throw new CompletionAttributionError();
          }
        }

        const stmts: D1PreparedStatement[] = [
          this.db
            .prepare(
              "UPDATE todos SET completed = 0, started_at = ?, started_by = ? WHERE id = ? AND list_id = ?"
            )
            .bind(latest?.started_at ?? null, latest?.started_by ?? null, id, this.listId),
        ];
        if (latest) {
          stmts.push(
            this.db
              .prepare("UPDATE task_completions SET voided_at = ? WHERE id = ?")
              .bind(serverNow, latest.id)
          );
        }
        await this.runBatch(stmts);
      }
    }

    let updatedSubtasks: Todo[] | undefined;
    if (completed && (options.subtaskAction === "complete" || options.subtaskAction === "promote")) {
      const { results: openRows } = await this.db
        .prepare(
          "SELECT * FROM todos WHERE list_id = ? AND parent_id = ? AND completed = 0 ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, created_at DESC"
        )
        .bind(this.listId, id)
        .all<TodoRow>();

      if (openRows.length > 0) {
        if (options.subtaskAction === "complete") {
          const subStmts: D1PreparedStatement[] = [
            this.db
              .prepare(
                "UPDATE todos SET completed = 1, started_at = NULL, started_by = NULL WHERE list_id = ? AND parent_id = ? AND completed = 0"
              )
              .bind(this.listId, id),
          ];
          if (canLog && options.userId) {
            for (const subRow of openRows) {
              const subPrepared = this.prepareCompletionInsert({
                todo: subRow,
                userId: options.userId,
                completedAt: effectiveCompletedAt,
                timeZone: completionTimeZone,
                source,
                opId: null,
              });
              subStmts.push(subPrepared.stmt);
            }
          }
          await this.runBatch(subStmts);
          updatedSubtasks = openRows.map((row) => ({
            ...this.mapRow(row),
            completed: true,
            startedAt: undefined,
            startedBy: undefined,
          }));
        } else {
          const minTopRow = await this.db
            .prepare("SELECT MIN(sort_order) AS min_order FROM todos WHERE list_id = ? AND parent_id IS NULL")
            .bind(this.listId)
            .first<{ min_order: number | null }>();
          const firstOrder =
            minTopRow?.min_order !== null && minTopRow?.min_order !== undefined
              ? Number(minTopRow.min_order) - openRows.length
              : 0;
          const promoteStmts = openRows.map((row, index) =>
            this.db
              .prepare("UPDATE todos SET parent_id = NULL, sort_order = ? WHERE id = ? AND list_id = ?")
              .bind(firstOrder + index, row.id, this.listId)
          );
          await this.runBatch(promoteStmts);
          updatedSubtasks = openRows.map((row, index) => ({
            ...this.mapRow(row),
            parentId: undefined,
            sortOrder: firstOrder + index,
          }));
        }
      } else {
        updatedSubtasks = [];
      }
    }

    if (currentlyCompleted === Boolean(completed)) {
      const mapped = this.mapRow(todo);
      return updatedSubtasks
        ? { todo: mapped, rescheduled: false, updatedSubtasks, completion: null }
        : { todo: mapped, rescheduled: false, completion: null };
    }

    const updated = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!updated) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    const mapped = this.mapRow(updated);
    return updatedSubtasks
      ? { todo: mapped, rescheduled: false, updatedSubtasks, completion: completionSummary }
      : { todo: mapped, rescheduled: false, completion: completionSummary };
  }

  /**
   * Undoes the most recent (or specified) completion entry on a task—primarily
   * repeating tasks—restoring `reminder_at` and `reminder_sent` (via
   * `previous_reminder_sent` or elapsed fallback) and voiding the log row.
   */
  async undoRepeatCompletion(
    id: string,
    options: { completionId?: string; userId?: string; isOwner?: boolean; now?: number } = {}
  ): Promise<{ todo: Todo; undone: boolean; voidedCompletionId: string | null }> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }

    const row = options.completionId
      ? await this.db
          .prepare(
            `SELECT id, user_id, started_at, started_by, reminder_at, previous_reminder_sent
             FROM task_completions
             WHERE id = ? AND todo_id = ? AND list_id = ? AND voided_at IS NULL`
          )
          .bind(options.completionId, id, this.listId)
          .first<{
            id: string;
            user_id: string;
            started_at: number | null;
            started_by: string | null;
            reminder_at: number | null;
            previous_reminder_sent: number | null;
          }>()
      : await this.db
          .prepare(
            `SELECT id, user_id, started_at, started_by, reminder_at, previous_reminder_sent
             FROM task_completions
             WHERE todo_id = ? AND list_id = ? AND voided_at IS NULL
             ORDER BY completed_at DESC
             LIMIT 1`
          )
          .bind(id, this.listId)
          .first<{
            id: string;
            user_id: string;
            started_at: number | null;
            started_by: string | null;
            reminder_at: number | null;
            previous_reminder_sent: number | null;
          }>();

    if (!row) {
      return { todo: this.mapRow(todo), undone: false, voidedCompletionId: null };
    }

    const attributedUserId = row.started_by || row.user_id;
    if (!options.isOwner && (!options.userId || attributedUserId !== options.userId)) {
      throw new CompletionAttributionError();
    }

    const serverNow = options.now ?? Date.now();
    const restoredReminderAt = row.reminder_at != null ? Number(row.reminder_at) : null;
    const prevSentRaw =
      row.previous_reminder_sent != null ? Number(row.previous_reminder_sent) : null;
    const restoredReminderSent = resolveRestoredReminderSent(
      restoredReminderAt,
      prevSentRaw,
      serverNow
    );
    const restoredStartedAt = row.started_at != null ? Number(row.started_at) : null;
    const restoredStartedBy = restoredStartedAt !== null ? row.started_by : null;

    await this.runBatch([
      this.db
        .prepare(
          `UPDATE todos
           SET completed = 0, reminder_at = ?, reminder_sent = ?, started_at = ?, started_by = ?
           WHERE id = ? AND list_id = ?`
        )
        .bind(
          restoredReminderAt,
          restoredReminderSent,
          restoredStartedAt,
          restoredStartedBy,
          id,
          this.listId
        ),
      this.db
        .prepare("UPDATE task_completions SET voided_at = ? WHERE id = ?")
        .bind(serverNow, row.id),
    ]);

    const updated = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!updated) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return {
      todo: this.mapRow(updated),
      undone: true,
      voidedCompletionId: row.id,
    };
  }

  /**
   * Toggles the completed status of a todo item (legacy flip).
   * Prefer setCompleted for idempotent clients.
   */
  async toggle(
    id: string,
    options: {
      timeZone?: string;
      completerTimeZone?: string | null;
      userId?: string;
      isOwner?: boolean;
      source?: CompletionSource;
    } = {}
  ): Promise<Todo & { rescheduled: boolean }> {
    const todo = await this.db
      .prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?")
      .bind(id, this.listId)
      .first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    const result = await this.setCompleted(id, !todo.completed, options);
    return { ...result.todo, rescheduled: result.rescheduled };
  }

  /**
   * Deletes a todo item
   * @param id - The unique identifier of the todo item to delete
   * @returns Promise that resolves when the deletion is complete
   */
  async delete(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).run();
  }

  /**
   * Updates the text of a todo item
   * @param id - The unique identifier of the todo item
   * @param text - The new text content
   * @returns Promise containing the updated Todo item
   */
  async updateText(id: string, text: string): Promise<Todo> {
    this.assertRunSucceeded(
      await this.db.prepare("UPDATE todos SET text = ? WHERE id = ? AND list_id = ?").bind(text, id, this.listId).run()
    );
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the priority level of a todo item
   * @param id - The unique identifier of the todo item
   * @param priority - The new priority level
   * @returns Promise containing the updated Todo item
   */
  async updatePriority(id: string, priority: "low" | "medium" | "high" | "none"): Promise<Todo> {
    this.assertRunSucceeded(
      await this.db.prepare("UPDATE todos SET priority = ? WHERE id = ? AND list_id = ?").bind(priority, id, this.listId).run()
    );
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the reminder timestamp of a todo item
   * @param id - The unique identifier of the todo item
   * @param reminderAt - The new reminder timestamp (in ms) or undefined to clear
   * @param reminderUserId - Optional user ID who owns the reminder notification
   * @returns Promise containing the updated Todo item
   */
  async updateReminder(id: string, reminderAt?: number, reminderUserId?: string | null): Promise<Todo> {
    const val = reminderAt !== undefined ? reminderAt : null;
    const ownerVal = reminderAt !== undefined ? (reminderUserId ?? null) : null;
    await this.db
      .prepare("UPDATE todos SET reminder_at = ?, reminder_sent = ?, reminder_user_id = ? WHERE id = ? AND list_id = ?")
      .bind(val, reminderAt !== undefined ? 0 : null, ownerVal, id, this.listId)
      .run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Marks a reminder as sent
   * @param id - The unique identifier of the todo item
   * @returns Promise containing the updated Todo item
   * @throws Error if the todo item with the specified ID is not found
   */
  async markReminderSent(id: string): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET reminder_sent = 1 WHERE id = ? AND list_id = ?").bind(id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the recurrence setting of a todo item
   * @param id - The unique identifier of the todo item
   * @param recurrence - The new recurrence setting
   * @returns Promise containing the updated Todo item
   */
  async updateRecurrence(id: string, recurrence: "none" | "daily" | "weekly" | "monthly"): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET recurrence = ? WHERE id = ? AND list_id = ?").bind(recurrence, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Updates the duration (in minutes) of a todo item
   * @param id - The unique identifier of the todo item
   * @param durationMinutes - The duration in minutes or null to clear
   * @returns Promise containing the updated Todo item
   */
  async updateDuration(id: string, durationMinutes: number | null): Promise<Todo> {
    await this.db.prepare("UPDATE todos SET duration_minutes = ? WHERE id = ? AND list_id = ?").bind(durationMinutes, id, this.listId).run();
    const todo = await this.db.prepare("SELECT * FROM todos WHERE id = ? AND list_id = ?").bind(id, this.listId).first<TodoRow>();
    if (!todo) {
      throw new Error(`Todo with id ${id} not found in this list`);
    }
    return this.mapRow(todo);
  }

  /**
   * Reorders tasks or subtasks within `(this.listId, parentId)` using slot-preserving merge
   * and normalizes `sort_order` densely (`0..n-1`) for all siblings in that scope.
   */
  async reorder(orderedIds: string[], parentId: string | null = null): Promise<Todo[]> {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new Error("Invalid reorder task IDs");
    }
    const seenRequested = new Set<string>();
    for (const rawId of orderedIds) {
      if (typeof rawId !== "string" || !rawId.trim() || seenRequested.has(rawId)) {
        throw new Error("Invalid reorder task IDs");
      }
      seenRequested.add(rawId);
    }

    const { results: scopeRows } = await this.db
      .prepare(
        parentId
          ? "SELECT id FROM todos WHERE list_id = ? AND parent_id = ? ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, created_at DESC, id ASC"
          : "SELECT id FROM todos WHERE list_id = ? AND parent_id IS NULL ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, created_at DESC, id ASC"
      )
      .bind(...(parentId ? [this.listId, parentId] : [this.listId]))
      .all<{ id: string }>();

    const scopeIds = new Set(scopeRows.map((r) => r.id));
    for (const id of orderedIds) {
      if (!scopeIds.has(id)) {
        throw new Error("Invalid reorder task IDs");
      }
    }

    const mergedIds: string[] = [];
    let queueIdx = 0;
    for (const row of scopeRows) {
      if (seenRequested.has(row.id)) {
        mergedIds.push(orderedIds[queueIdx++]);
      } else {
        mergedIds.push(row.id);
      }
    }

    const statements = mergedIds.map((id, index) =>
      this.db
        .prepare("UPDATE todos SET sort_order = ? WHERE id = ? AND list_id = ?")
        .bind(index, id, this.listId)
    );
    await this.runBatch(statements);
    return await this.list();
  }

  /**
   * Removes all completed todos from storage
   * @returns Promise that resolves when the operation is complete
   */
  async clearCompleted(): Promise<void> {
    await this.db.prepare("DELETE FROM todos WHERE list_id = ? AND completed = 1").bind(this.listId).run();
  }
}
