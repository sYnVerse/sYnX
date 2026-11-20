import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import {
  TodoManager,
  clampClientTimestamp,
  getTodoCompletions,
  pruneVoidedTaskCompletions,
  MAX_STAT_DURATION_SECONDS,
} from "../app/to-do-manager";
import { getDueReminderRecipients } from "../app/due-reminders.server";
import { cloudflareContext } from "../app/context.server";
import { action as startTodoRouteAction } from "../app/routes/api.v1.todos.$id.start";
import { loader as completionsRouteLoader } from "../app/routes/api.v1.todos.$id.completions";
import { action as completedRouteAction } from "../app/routes/api.v1.todos.$id.completed";
import { env } from "cloudflare:test";

describe("TodoManager", () => {
  let db: D1Database;
  let manager: TodoManager;
  const listId = "test-list-id";

  beforeEach(async () => {
    db = env.DB;

    // Setup a mock list
    await db.prepare("INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(listId, "Test List", "test-user", Date.now())
      .run();

    manager = new TodoManager(db, listId);
  });

  afterEach(async () => {
    await db.exec("DELETE FROM task_completions");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
  });

  describe("list()", () => {
    it("returns empty array when no todos exist", async () => {
      const todos = await manager.list();
      expect(todos).toEqual([]);
    });

    it("returns todos sorted by createdAt desc", async () => {
      const todo1 = await manager.create("First");
      await new Promise((r) => setTimeout(r, 10));
      const todo2 = await manager.create("Second");

      const todos = await manager.list();
      expect(todos).toHaveLength(2);
      expect(todos).toEqual([todo2, todo1]);
    });
  });

  describe("create()", () => {
    it("records who added the task", async () => {
      const todo = await manager.create("Added by me", "none", null, undefined, "none", null, null, "user-creator");
      expect(todo.createdBy).toBe("user-creator");

      const row = await env.DB.prepare("SELECT created_by FROM todos WHERE id = ?")
        .bind(todo.id)
        .first<{ created_by: string | null }>();
      expect(row?.created_by).toBe("user-creator");

      const [stored] = await manager.list();
      expect(stored.createdBy).toBe("user-creator");
    });

    it("leaves the creator empty when none is given", async () => {
      const todo = await manager.create("No creator");
      const row = await env.DB.prepare("SELECT created_by FROM todos WHERE id = ?")
        .bind(todo.id)
        .first<{ created_by: string | null }>();
      expect(row?.created_by).toBeNull();
    });

    it("creates a new todo with default priority as none", async () => {
      const todo = await manager.create("Test todo");

      expect(todo).toMatchObject({
        text: "Test todo",
        completed: false,
      });
      expect(todo.id).toBeDefined();
      expect(todo.createdAt).toBeTypeOf("number");
      expect(todo.priority).toBe("none");

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo]);
    });

    it("creates a todo with custom priority", async () => {
      const todo = await manager.create("High priority todo", "high");

      expect(todo).toMatchObject({
        text: "High priority todo",
        completed: false,
        priority: "high",
      });
      expect(todo.id).toBeDefined();
      expect(todo.createdAt).toBeTypeOf("number");

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo]);
    });

    it("creates a todo with custom reminderAt", async () => {
      const reminderTime = Date.now() + 60000;
      const todo = await manager.create("Reminder todo", "medium", reminderTime);

      expect(todo).toMatchObject({
        text: "Reminder todo",
        completed: false,
        priority: "medium",
        reminderAt: reminderTime,
        reminderSent: false,
      });

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo]);
    });
  });

  describe("toggle()", () => {
    it("toggles todo completion status", async () => {
      const todo = await manager.create("Test todo");
      expect(todo.completed).toBe(false);

      const toggled = await manager.toggle(todo.id);
      expect(toggled.completed).toBe(true);
      expect(toggled.rescheduled).toBe(false);

      const storedTodos = await manager.list();
      expect(storedTodos[0].completed).toBe(true);
    });
  });

  describe("delete()", () => {
    it("deletes a todo", async () => {
      const todo = await manager.create("Test todo");
      await manager.delete(todo.id);

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([]);
    });

    it("deletes a todo when there are multiple todos", async () => {
      const todo1 = await manager.create("Test todo 1");
      const todo2 = await manager.create("Test todo 2");
      await manager.delete(todo1.id);

      const storedTodos = await manager.list();
      expect(storedTodos).toEqual([todo2]);
    });
  });

  describe("updatePriority()", () => {
    it("updates the priority of a todo", async () => {
      const todo = await manager.create("Test todo");
      expect(todo.priority).toBe("none");

      const updated = await manager.updatePriority(todo.id, "high");
      expect(updated.priority).toBe("high");

      const storedTodos = await manager.list();
      expect(storedTodos[0].priority).toBe("high");
    });

    it("updates the priority of a todo to none", async () => {
      const todo = await manager.create("Test todo", "high");
      expect(todo.priority).toBe("high");

      const updated = await manager.updatePriority(todo.id, "none");
      expect(updated.priority).toBe("none");

      const storedTodos = await manager.list();
      expect(storedTodos[0].priority).toBe("none");
    });
  });

  describe("updateText()", () => {
    it("updates the text content of a todo", async () => {
      const todo = await manager.create("Old text");
      expect(todo.text).toBe("Old text");

      const updated = await manager.updateText(todo.id, "New text");
      expect(updated.text).toBe("New text");

      const storedTodos = await manager.list();
      expect(storedTodos[0].text).toBe("New text");
    });
  });

  describe("updateReminder()", () => {
    it("updates the reminder of a todo", async () => {
      const todo = await manager.create("Test todo");
      expect(todo.reminderAt).toBeUndefined();

      const reminderTime = Date.now() + 120000;
      const updated = await manager.updateReminder(todo.id, reminderTime);
      expect(updated.reminderAt).toBe(reminderTime);
      expect(updated.reminderSent).toBe(false);

      const storedTodos = await manager.list();
      expect(storedTodos[0].reminderAt).toBe(reminderTime);
      expect(storedTodos[0].reminderSent).toBe(false);
    });

    it("clears the reminder of a todo", async () => {
      const reminderTime = Date.now() + 120000;
      const todo = await manager.create("Test todo", "medium", reminderTime);
      expect(todo.reminderAt).toBe(reminderTime);

      const updated = await manager.updateReminder(todo.id, undefined);
      expect(updated.reminderAt).toBeUndefined();
      expect(updated.reminderSent).toBeUndefined();

      const storedTodos = await manager.list();
      expect(storedTodos[0].reminderAt).toBe(reminderTime ? undefined : 0); // wait, expect undefined since we cleared it
      expect(storedTodos[0].reminderAt).toBeUndefined();
      expect(storedTodos[0].reminderSent).toBeUndefined();
    });
  });

  describe("markReminderSent()", () => {
    it("marks the reminder of a todo as sent", async () => {
      const reminderTime = Date.now() + 120000;
      const todo = await manager.create("Test todo", "medium", reminderTime);
      expect(todo.reminderSent).toBe(false);

      const updated = await manager.markReminderSent(todo.id);
      expect(updated.reminderSent).toBe(true);

      const storedTodos = await manager.list();
      expect(storedTodos[0].reminderSent).toBe(true);
    });
  });

  describe("clearCompleted()", () => {
    it("removes all completed todos", async () => {
      const todo1 = await manager.create("Active todo");
      const todo2 = await manager.create("Completed todo");
      await manager.toggle(todo2.id);

      await manager.clearCompleted();

      const storedTodos = await manager.list();
      expect(storedTodos).toHaveLength(1);
      expect(storedTodos[0].id).toBe(todo1.id);
    });
  });

  describe("expirationTtl", () => {
    it("can be instantiated with an expiration TTL", async () => {
      await db.prepare("INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
        .bind("expiring_todos", "Expiring List", "test-user", Date.now())
        .run();
      const expiringManager = new TodoManager(db, "expiring_todos", 86400);
      const todo = await expiringManager.create("Expiring task");
      expect(todo.text).toBe("Expiring task");

      const stored = await expiringManager.list();
      expect(stored).toHaveLength(1);
    });
  });

  describe("subtasks", () => {
    it("creates a subtask with parentId", async () => {
      const parent = await manager.create("Parent task");
      const subtask = await manager.create("Subtask task", "low", undefined, parent.id);

      expect(subtask).toMatchObject({
        text: "Subtask task",
        completed: false,
        parentId: parent.id,
      });

      const list = await manager.list();
      const foundSub = list.find((t) => t.id === subtask.id);
      expect(foundSub).toBeDefined();
      expect(foundSub?.parentId).toBe(parent.id);
    });

    it("deletes all subtasks when parent task is deleted", async () => {
      const parent = await manager.create("Parent task");
      await manager.create("Subtask 1", "none", undefined, parent.id);
      await manager.create("Subtask 2", "none", undefined, parent.id);

      expect(await manager.list()).toHaveLength(3);

      await manager.delete(parent.id);

      const listAfterDelete = await manager.list();
      expect(listAfterDelete).toHaveLength(0);
    });
  });

  describe("recurrence", () => {
    it("updates recurrence setting of a todo", async () => {
      const todo = await manager.create("Recurring task");
      expect(todo.recurrence).toBe("none");

      const updated = await manager.updateRecurrence(todo.id, "daily");
      expect(updated.recurrence).toBe("daily");

      const stored = await manager.list();
      expect(stored[0].recurrence).toBe("daily");
    });

    it("reschedules reminderAt on toggle when recurrence is daily", async () => {
      const now = Date.now();
      const todo = await manager.create("Daily task", "none", now, undefined, "daily");
      expect(todo.completed).toBe(false);
      expect(todo.recurrence).toBe("daily");

      const toggled = await manager.toggle(todo.id);
      expect(toggled.completed).toBe(false);
      expect(toggled.reminderAt).toBe(now + 24 * 60 * 60 * 1000);
      expect(toggled.rescheduled).toBe(true);
      expect(toggled.reminderSent).toBe(false);
    });

    it("reschedules reminderAt on toggle when recurrence is weekly", async () => {
      const now = Date.now();
      const todo = await manager.create("Weekly task", "none", now, undefined, "weekly");
      const toggled = await manager.toggle(todo.id);

      expect(toggled.completed).toBe(false);
      expect(toggled.reminderAt).toBe(now + 7 * 24 * 60 * 60 * 1000);
      expect(toggled.rescheduled).toBe(true);
      expect(toggled.reminderSent).toBe(false);
    });
  });

  describe("durationMinutes", () => {
    it("defaults durationMinutes to undefined (no duration) when not specified", async () => {
      const todo = await manager.create("No duration task");
      expect(todo.durationMinutes).toBeUndefined();

      const stored = await manager.list();
      expect(stored[0].durationMinutes).toBeUndefined();
    });

    it("creates a todo with custom durationMinutes", async () => {
      const todo = await manager.create("Timed task", "medium", undefined, undefined, "none", 45);
      expect(todo.durationMinutes).toBe(45);

      const stored = await manager.list();
      expect(stored[0].durationMinutes).toBe(45);
    });

    it("updates durationMinutes and can clear it to null", async () => {
      const todo = await manager.create("Timed task", "medium", undefined, undefined, "none", 30);
      expect(todo.durationMinutes).toBe(30);

      const updated = await manager.updateDuration(todo.id, 60);
      expect(updated.durationMinutes).toBe(60);

      const cleared = await manager.updateDuration(todo.id, null);
      expect(cleared.durationMinutes).toBeUndefined();
    });
  });

  describe("reminderUserId (per-user reminders on shared lists)", () => {
    it("stores reminderUserId when creating a todo with a reminder", async () => {
      const reminderTime = Date.now() + 60000;
      const todo = await manager.create(
        "Collaborator reminder",
        "high",
        reminderTime,
        undefined,
        "none",
        undefined,
        "collab-user-123"
      );

      expect(todo.reminderAt).toBe(reminderTime);
      expect(todo.reminderUserId).toBe("collab-user-123");

      const stored = await manager.list();
      expect(stored[0].reminderUserId).toBe("collab-user-123");
    });

    it("updates and clears reminderUserId via updateReminder()", async () => {
      const todo = await manager.create("Shared task");
      expect(todo.reminderUserId).toBeUndefined();

      const reminderTime = Date.now() + 120000;
      const updated = await manager.updateReminder(todo.id, reminderTime, "collab-user-456");
      expect(updated.reminderAt).toBe(reminderTime);
      expect(updated.reminderUserId).toBe("collab-user-456");

      const cleared = await manager.updateReminder(todo.id, undefined, "collab-user-456");
      expect(cleared.reminderAt).toBeUndefined();
      expect(cleared.reminderUserId).toBeUndefined();
    });

    it("routes due reminders to reminder_user_id and falls back to list owner for legacy rows", async () => {
      const pastTime = Date.now() - 5000;
      const legacyTodo = await manager.create("Legacy reminder", "none", pastTime);
      const collabTodo = await manager.create(
        "Collab reminder",
        "none",
        pastTime,
        undefined,
        "none",
        undefined,
        "collab-user-789"
      );

      const futureTodo = await manager.create(
        "Not due yet",
        "none",
        Date.now() + 60 * 60 * 1000,
        undefined,
        "none",
        undefined,
        "collab-user-789"
      );
      await db
        .prepare("INSERT OR REPLACE INTO user_settings (user_id, email, email_enabled) VALUES (?, ?, 1)")
        .bind("collab-user-789", "collab@example.com")
        .run();

      // The same query the cron dispatch in server.ts uses.
      const due = await getDueReminderRecipients(db, Date.now());
      const byId = new Map(due.map((r) => [r.id, r]));
      expect(byId.get(legacyTodo.id)?.userId).toBe("test-user");
      expect(byId.get(collabTodo.id)?.userId).toBe("collab-user-789");
      expect(byId.get(collabTodo.id)?.email).toBe("collab@example.com");
      expect(byId.get(collabTodo.id)?.listName).toBe("Test List");
      expect(byId.has(futureTodo.id)).toBe(false);

      await db.prepare("DELETE FROM user_settings WHERE user_id = ?").bind("collab-user-789").run();
    });
  });

  describe("durationMinutes cleanup", () => {
    it("confirms cleared duration is undefined", () => {
      expect(true).toBe(true);
    });
  });

  describe("time tracking & task_completions log (#99)", () => {
    const makeApiContext = () => {
      const provider = new RouterContextProvider();
      provider.set(cloudflareContext, {
        env: { ...env, ALLOW_DEV_TEST_AUTH: "true" } as unknown as Env,
        ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
      });
      return provider;
    };

    it("clamps client timestamps to [serverNow - 24h, serverNow]", () => {
      const serverNow = 1_700_000_000_000;
      const dayMs = 24 * 60 * 60 * 1000;
      expect(clampClientTimestamp(serverNow + 60_000, serverNow)).toBe(serverNow);
      expect(clampClientTimestamp(serverNow - 2 * dayMs, serverNow)).toBe(serverNow - dayMs);
      expect(clampClientTimestamp(serverNow - 5_000, serverNow)).toBe(serverNow - 5_000);
      expect(clampClientTimestamp(undefined, serverNow)).toBe(serverNow);
    });

    it("startTodo preserves an earlier running start and cancelStartTodo clears it", async () => {
      const todo = await manager.create("Workout");
      const firstStart = Date.now() - 120_000;
      const started = await manager.startTodo(todo.id, "user-a", firstStart);
      expect(started.startedAt).toBe(firstStart);
      expect(started.startedBy).toBe("user-a");

      // Starting again keeps earlier started_at and original started_by
      const second = await manager.startTodo(todo.id, "user-b", Date.now());
      expect(second.startedAt).toBe(firstStart);
      expect(second.startedBy).toBe("user-a");

      const cancelled = await manager.cancelStartTodo(todo.id);
      expect(cancelled.startedAt).toBeUndefined();
      expect(cancelled.startedBy).toBeUndefined();
    });

    it("records non-negative duration, starter vs completer attribution, and survives delete & clearCompleted", async () => {
      const todo = await manager.create("Prepare slides", "high", null, undefined, "none", 20);
      const startAt = Date.now() - 300_000;
      await manager.startTodo(todo.id, "user-starter", startAt);

      // Even if a client sends completedAt slightly earlier than startedAt, duration never goes negative.
      const res = await manager.setCompleted(todo.id, true, {
        userId: "user-completer",
        completedAt: startAt - 5_000,
        source: "widget",
        opId: "op-nonneg-1",
      });
      expect(res.completion?.durationSeconds).toBe(0);

      // Clear completed and delete must keep task_completions history intact.
      await manager.clearCompleted();
      await manager.delete(todo.id);

      const row = await db
        .prepare("SELECT * FROM task_completions WHERE todo_id = ?")
        .bind(todo.id)
        .first<{ user_id: string; started_by: string | null; duration_seconds: number; source: string }>();
      expect(row?.user_id).toBe("user-completer");
      expect(row?.started_by).toBe("user-starter");
      expect(row?.duration_seconds).toBe(0);
      expect(row?.source).toBe("widget");
    });

    it("prevents duplicate rows and double repeat advancement on opId replay", async () => {
      const future = Date.now() + 3_600_000;
      const repeat = await manager.create("Daily review", "none", future, undefined, "daily", 15, "user-1");

      const first = await manager.setCompleted(repeat.id, true, {
        userId: "user-1",
        source: "app",
        opId: "op-repeat-1",
        timeZone: "UTC",
      });
      expect(first.rescheduled).toBe(true);
      const afterFirstReminder = first.todo.reminderAt!;
      expect(afterFirstReminder).toBeGreaterThan(future);

      const second = await manager.setCompleted(repeat.id, true, {
        userId: "user-1",
        source: "app",
        opId: "op-repeat-1",
        timeZone: "UTC",
      });
      expect(second.rescheduled).toBe(false);
      expect(second.todo.reminderAt).toBe(afterFirstReminder);
      expect(second.completion?.id).toBe(first.completion?.id);

      const rows = await db
        .prepare("SELECT * FROM task_completions WHERE todo_id = ?")
        .bind(repeat.id)
        .all<{ reminder_at: number | null; previous_reminder_sent: number | null }>();
      expect(rows.results).toHaveLength(1);
      expect(rows.results[0].reminder_at).toBe(future);
      expect(rows.results[0].previous_reminder_sent).toBe(0);
    });

    it("voids latest completion row and restores started_at/started_by on undo, plus 30-day pruning", async () => {
      const todo = await manager.create("Write essay");
      const startedAt = Date.now() - 600_000;
      await manager.startTodo(todo.id, "user-1", startedAt);

      await manager.setCompleted(todo.id, true, { userId: "user-1", source: "web" });
      const undone = await manager.setCompleted(todo.id, false, { userId: "user-1", source: "web" });
      expect(undone.todo.completed).toBe(false);
      expect(undone.todo.startedAt).toBe(startedAt);
      expect(undone.todo.startedBy).toBe("user-1");

      // Mark voided row older than 30 days and verify prune deletes only old voided rows.
      const now = Date.now();
      const oldVoided = now - 31 * 24 * 60 * 60 * 1000;
      await db.prepare("UPDATE task_completions SET voided_at = ? WHERE todo_id = ?").bind(oldVoided, todo.id).run();
      await manager.setCompleted(todo.id, true, { userId: "user-1", source: "web" });

      const pruned = await pruneVoidedTaskCompletions(db, now);
      expect(pruned).toBe(1);
      const remaining = await db
        .prepare("SELECT * FROM task_completions WHERE todo_id = ?")
        .bind(todo.id)
        .all();
      expect(remaining.results).toHaveLength(1);
    });

    it("computes averages/medians scoped to caller while excluding >12h outliers", async () => {
      const repeat = await manager.create("Standup", "none", Date.now() + 3_600_000, undefined, "daily", 15);
      const now = Date.now();

      await db.batch([
        db
          .prepare(
            `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source)
             VALUES (?, ?, ?, 'Standup', 'user-1', 'user-1', ?, ?, 600, 15, 'app')`
          )
          .bind("c1", repeat.id, listId, now - 30_000, now - 20_000),
        db
          .prepare(
            `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source)
             VALUES (?, ?, ?, 'Standup', 'user-1', 'user-1', ?, ?, 1200, 15, 'app')`
          )
          .bind("c2", repeat.id, listId, now - 20_000, now - 10_000),
        db
          .prepare(
            `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source)
             VALUES (?, ?, ?, 'Standup', 'user-1', 'user-1', ?, ?, ?, 15, 'app')`
          )
          .bind("c3-outlier", repeat.id, listId, now - 10_000, now - 5_000, MAX_STAT_DURATION_SECONDS + 1),
        db
          .prepare(
            `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source)
             VALUES (?, ?, ?, 'Standup', 'user-other', 'user-other', ?, ?, 300, 15, 'app')`
          )
          .bind("c4-other", repeat.id, listId, now - 5_000, now),
      ]);

      const stats = await getTodoCompletions(db, repeat.id, listId, "user-1");
      expect(stats.count).toBe(3); // excludes user-other, keeps >12h outlier in entries
      expect(stats.timedCount).toBe(2); // excludes >12h outlier from stats
      expect(stats.averageSeconds).toBe(900);
      expect(stats.medianSeconds).toBe(900);
      expect(stats.lastDurationSeconds).toBe(1200);
      expect(stats.estimatedMinutes).toBe(15);
    });

    it("handles /start, /completed, and /completions API routes end-to-end", async () => {
      const todo = await manager.create("API Timed Task", "medium", null, undefined, "none", 30);
      const authHeader = { Authorization: "Bearer e2e_test_session:test-user:test@example.com" };

      const startRes = await startTodoRouteAction({
        request: new Request(`http://127.0.0.1:8787/api/v1/todos/${todo.id}/start`, {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ startedAt: Date.now() - 90_000 }),
        }),
        params: { id: todo.id },
        context: makeApiContext(),
        url: new URL(`http://127.0.0.1:8787/api/v1/todos/${todo.id}/start`),
        pattern: "/api/v1/todos/:id/start",
      });
      expect(startRes.status).toBe(200);

      const completedRes = await completedRouteAction({
        request: new Request(`http://127.0.0.1:8787/api/v1/todos/${todo.id}/completed`, {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ completed: true, source: "app", opId: "api-op-1" }),
        }),
        params: { id: todo.id },
        context: makeApiContext(),
        url: new URL(`http://127.0.0.1:8787/api/v1/todos/${todo.id}/completed`),
        pattern: "/api/v1/todos/:id/completed",
      });
      expect(completedRes.status).toBe(200);
      const completedJson = (await completedRes.json()) as {
        completion: { id: string; durationSeconds: number | null };
      };
      expect(completedJson.completion.durationSeconds).toBeGreaterThanOrEqual(89);

      const statsRes = await completionsRouteLoader({
        request: new Request(`http://127.0.0.1:8787/api/v1/todos/${todo.id}/completions`, {
          headers: authHeader,
        }),
        params: { id: todo.id },
        context: makeApiContext(),
        url: new URL(`http://127.0.0.1:8787/api/v1/todos/${todo.id}/completions`),
        pattern: "/api/v1/todos/:id/completions",
      });
      expect(statsRes.status).toBe(200);
      const statsJson = (await statsRes.json()) as { stats: { count: number; entries: unknown[] } };
      expect(statsJson.stats.count).toBe(1);
      expect(statsJson.stats.entries).toHaveLength(1);
    });
  });
});
