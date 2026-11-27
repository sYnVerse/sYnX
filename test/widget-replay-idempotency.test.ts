import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { action as completedApiAction } from "../backend/api/v1/todos.$id.completed";
import { TodoManager, getTodoCompletions } from "../backend/services/to-do-manager";

const OWNER_ID = "owner-widget-idempotency-test";

vi.mock("../backend/services/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../backend/services/auth.server")>();
  return {
    ...actual,
    verifyBearerToken: vi.fn(async () => ({
      userId: OWNER_ID,
      email: "owner@example.com",
      token: "test-token",
    })),
  };
});

async function replayCompleted(
  todoId: string,
  body: { completed: boolean; completedAt: number; source: "widget"; opId: string }
): Promise<Response> {
  const pending: Promise<unknown>[] = [];
  const res = await completedApiAction({
    request: new Request(`http://localhost/api/v1/todos/${todoId}/completed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify(body),
    }),
    params: { id: todoId },
    context: {
      cloudflare: {
        env,
        ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) },
      },
    },
  } as unknown as Parameters<typeof completedApiAction>[0]);
  await Promise.all(pending);
  return res;
}

describe("widget replay idempotency (#254)", () => {
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

  it("draining the same one-time op twice gives one completion", async () => {
    const listId = `list-once-${crypto.randomUUID()}`;
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'private')"
      )
      .bind(listId, "One-Time List", OWNER_ID, Date.now())
      .run();

    const manager = new TodoManager(db, listId);
    const created = await manager.create(
      "Buy stamps",
      "medium",
      undefined,
      undefined,
      "none",
      undefined,
      OWNER_ID,
      OWNER_ID
    );
    const tapAt = Date.now() - 5_000;
    const payload = {
      completed: true,
      completedAt: tapAt,
      source: "widget" as const,
      opId: "w_once_op_1",
    };

    const res1 = await replayCompleted(created.id, payload);
    const res2 = await replayCompleted(created.id, payload);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const json2 = (await res2.json()) as { todo: { completed: boolean } };
    expect(json2.todo.completed).toBe(true);

    const stats = await getTodoCompletions(db, created.id, listId, OWNER_ID);
    expect(stats.count).toBe(1);
    expect(stats.entries[0]?.source).toBe("widget");
    expect(stats.entries[0]?.completedAt).toBe(tapAt);
  });

  it("draining the same repeating op twice creates one completion and advances the reminder only once", async () => {
    const listId = `list-repeat-${crypto.randomUUID()}`;
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'private')"
      )
      .bind(listId, "Repeating List", OWNER_ID, Date.now())
      .run();

    const initialReminder = Date.UTC(2026, 10, 26, 17, 0, 0, 0);
    const manager = new TodoManager(db, listId);
    const created = await manager.create(
      "Water plants",
      "low",
      initialReminder,
      undefined,
      "daily",
      undefined,
      OWNER_ID,
      OWNER_ID
    );
    const tapAt = initialReminder + 60_000;
    const payload = {
      completed: true,
      completedAt: tapAt,
      source: "widget" as const,
      opId: "w_repeat_op_1",
    };

    const res1 = await replayCompleted(created.id, payload);
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as {
      rescheduled: boolean;
      todo: { completed: boolean; reminderAt?: number };
    };
    expect(json1.rescheduled).toBe(true);
    expect(json1.todo.completed).toBe(false);
    const advancedOnceReminder = json1.todo.reminderAt;
    expect(advancedOnceReminder).toBe(initialReminder + 24 * 60 * 60 * 1000);

    // Replaying the exact same opId a second time must be a complete no-op on both
    // completion history and the next occurrence reminderAt.
    const res2 = await replayCompleted(created.id, payload);
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as {
      rescheduled: boolean;
      todo: { completed: boolean; reminderAt?: number };
    };
    expect(json2.rescheduled).toBe(false);
    expect(json2.todo.completed).toBe(false);
    expect(json2.todo.reminderAt).toBe(advancedOnceReminder);

    const stats = await getTodoCompletions(db, created.id, listId, OWNER_ID);
    expect(stats.count).toBe(1);
    expect(stats.entries[0]?.source).toBe("widget");
  });
});
