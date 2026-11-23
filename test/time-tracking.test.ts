import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import {
  applySetCompletedLocal,
  applyStartTodoLocal,
  formatElapsedTimerLabel,
  formatTaskCompletionStatsLine,
  type TaskCompletionStats,
  type TodoItem,
} from "../shared";
import { action as completedApiAction } from "../app/routes/api.v1.todos.$id.completed";
import { TodoManager, getTodoCompletions } from "../app/to-do-manager";

const OWNER_ID = "owner-widget-replay-test";

vi.mock("../app/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth.server")>();
  return {
    ...actual,
    verifyBearerToken: vi.fn(async () => ({
      userId: OWNER_ID,
      email: "owner@example.com",
      token: "test-token",
    })),
  };
});

function makeTodo(overrides: Partial<TodoItem> & Pick<TodoItem, "id">): TodoItem {
  return {
    listId: "list-1",
    text: `Task ${overrides.id}`,
    completed: false,
    createdAt: 1_700_000_000_000,
    priority: "none",
    reminderSent: false,
    recurrence: "none",
    ...overrides,
  };
}

describe("time tracking shared helpers (#102)", () => {
  it("formats elapsed timer labels across minutes and hours", () => {
    const start = 1_700_000_000_000;
    expect(formatElapsedTimerLabel(start, start)).toBe("⏱ <1m");
    expect(formatElapsedTimerLabel(start, start + 59_000)).toBe("⏱ <1m");
    expect(formatElapsedTimerLabel(start, start + 60_000)).toBe("⏱ 1m");
    expect(formatElapsedTimerLabel(start, start + 12 * 60_000)).toBe("⏱ 12m");
    expect(formatElapsedTimerLabel(start, start + 60 * 60_000)).toBe("⏱ 1h");
    expect(formatElapsedTimerLabel(start, start + 95 * 60_000)).toBe("⏱ 1h 35m");
    expect(formatElapsedTimerLabel(start, start - 5_000)).toBe("⏱ <1m");
  });

  it("formats completion stats lines for repeating and one-time tasks", () => {
    const baseStats: TaskCompletionStats = {
      count: 8,
      timedCount: 8,
      averageSeconds: 23 * 60,
      medianSeconds: 22 * 60,
      lastDurationSeconds: 34 * 60,
      estimatedMinutes: 20,
      entries: [],
    };

    expect(
      formatTaskCompletionStatsLine(baseStats, { isRecurring: true, estimatedMinutes: 20 })
    ).toBe("Avg 23 min over last 8 • est 20");
    expect(
      formatTaskCompletionStatsLine(baseStats, { isRecurring: true, estimatedMinutes: null })
    ).toBe("Avg 23 min over last 8 • est 20");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, estimatedMinutes: null },
        { isRecurring: true, estimatedMinutes: null }
      )
    ).toBe("Avg 23 min over last 8");

    expect(
      formatTaskCompletionStatsLine(baseStats, { isRecurring: false, estimatedMinutes: 20 })
    ).toBe("Took 34 min • est 20 (+14)");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, lastDurationSeconds: 15 * 60 },
        { isRecurring: false, estimatedMinutes: 20 }
      )
    ).toBe("Took 15 min • est 20 (-5)");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, lastDurationSeconds: 20 * 60 },
        { isRecurring: false, estimatedMinutes: 20 }
      )
    ).toBe("Took 20 min • est 20 (0)");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, estimatedMinutes: null },
        { isRecurring: false, estimatedMinutes: null }
      )
    ).toBe("Took 34 min");

    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, timedCount: 1, averageSeconds: 45, lastDurationSeconds: 45, estimatedMinutes: null },
        { isRecurring: true, estimatedMinutes: null }
      )
    ).toBe("Avg <1 min over last 1");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, timedCount: 1, averageSeconds: 60, lastDurationSeconds: 60, estimatedMinutes: null },
        { isRecurring: true, estimatedMinutes: null }
      )
    ).toBe("Avg 1 min over last 1");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, lastDurationSeconds: 59, estimatedMinutes: null },
        { isRecurring: false, estimatedMinutes: null }
      )
    ).toBe("Took <1 min");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, lastDurationSeconds: 45, estimatedMinutes: 5 },
        { isRecurring: false, estimatedMinutes: 5 }
      )
    ).toBe("Took <1 min • est 5 (-5)");
    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, lastDurationSeconds: 60, estimatedMinutes: null },
        { isRecurring: false, estimatedMinutes: null }
      )
    ).toBe("Took 1 min");

    expect(
      formatTaskCompletionStatsLine(
        { ...baseStats, timedCount: 0, averageSeconds: null, lastDurationSeconds: null },
        { isRecurring: false }
      )
    ).toBeNull();
    expect(formatTaskCompletionStatsLine(null, { isRecurring: false })).toBeNull();
  });

  it("applies start and completion optimistic transitions cleanly", () => {
    const todo = makeTodo({ id: "t-1" });
    const started = applyStartTodoLocal(todo, 1_700_000_100_000, "user-1");
    expect(started.startedAt).toBe(1_700_000_100_000);
    expect(started.startedBy).toBe("user-1");

    const canceled = applyStartTodoLocal(started, null);
    expect(canceled.startedAt).toBeUndefined();
    expect(canceled.startedBy).toBeUndefined();

    const completed = applySetCompletedLocal(started, true, "UTC").todo;
    expect(completed.completed).toBe(true);
    expect(completed.startedAt).toBeUndefined();
    expect(completed.startedBy).toBeUndefined();

    const recurring = applyStartTodoLocal(
      makeTodo({
        id: "t-rec",
        recurrence: "daily",
        reminderAt: Date.UTC(2026, 10, 16, 9, 0, 0, 0),
      }),
      1_700_000_100_000,
      "user-1"
    );
    const rescheduled = applySetCompletedLocal(recurring, true, "UTC");
    expect(rescheduled.rescheduled).toBe(true);
    expect(rescheduled.todo.completed).toBe(false);
    expect(rescheduled.todo.startedAt).toBeUndefined();
    expect(rescheduled.todo.startedBy).toBeUndefined();
  });
});

describe("widget offline completion replay API idempotency (#102)", () => {
  let db: D1Database;

  beforeEach(() => {
    db = env.DB;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM list_activity");
    await db.exec("DELETE FROM task_completions");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
  });

  it("records completion at op.at once even when POST /api/v1/todos/:id/completed is replayed with the same opId", async () => {
    const listId = `list-widget-op-${crypto.randomUUID()}`;
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'private')")
      .bind(listId, "Widget List", OWNER_ID, Date.now())
      .run();

    const manager = new TodoManager(db, listId);
    const created = await manager.create("Timed widget task", "high", undefined, undefined, "none", 20, OWNER_ID, OWNER_ID);
    const serverNow = Date.now();
    const startAt = serverNow - 10 * 60_000;
    const tapAt = serverNow - 4 * 60_000;
    await manager.startTodo(created.id, OWNER_ID, startAt);

    const pending: Promise<unknown>[] = [];
    const replayOnce = () =>
      completedApiAction({
        request: new Request(`http://localhost/api/v1/todos/${created.id}/completed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
          body: JSON.stringify({
            completed: true,
            completedAt: tapAt,
            source: "widget",
            opId: "w_op_unique_1",
          }),
        }),
        params: { id: created.id },
        context: {
          cloudflare: {
            env,
            ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) },
          },
        },
      } as unknown as Parameters<typeof completedApiAction>[0]);

    const res1 = await replayOnce();
    const res2 = await replayOnce();
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    await Promise.all(pending);

    const payload2 = (await res2.json()) as { todo: { completed: boolean; startedAt?: number } };
    expect(payload2.todo.completed).toBe(true);
    expect(payload2.todo.startedAt).toBeUndefined();

    const stats = await getTodoCompletions(db, created.id, listId, OWNER_ID);
    expect(stats.count).toBe(1);
    expect(stats.timedCount).toBe(1);
    expect(stats.lastDurationSeconds).toBe(360);
    expect(stats.entries[0]?.source).toBe("widget");
    expect(stats.entries[0]?.completedAt).toBe(tapAt);
  });
});
