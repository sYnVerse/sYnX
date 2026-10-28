import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { TodoManager } from "../app/to-do-manager";
import { applySetCompletedLocal, formatRescheduledToast } from "../shared";
import { env } from "cloudflare:test";

describe("setCompleted / mark-done idempotency", () => {
  let db: D1Database;
  let manager: TodoManager;
  const listId = "test-list-set-completed";

  beforeEach(async () => {
    db = env.DB;

    await db
      .prepare("INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(listId, "Test List", "test-user", Date.now())
      .run();

    manager = new TodoManager(db, listId);
  });

  afterEach(async () => {
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
  });

  it("setCompleted is idempotent for true and false", async () => {
    const todo = await manager.create("Once");
    const first = await manager.setCompleted(todo.id, true);
    expect(first.todo.completed).toBe(true);
    expect(first.rescheduled).toBe(false);

    const second = await manager.setCompleted(todo.id, true);
    expect(second.todo.completed).toBe(true);
    expect(second.rescheduled).toBe(false);

    const cleared = await manager.setCompleted(todo.id, false);
    expect(cleared.todo.completed).toBe(false);
    const clearedAgain = await manager.setCompleted(todo.id, false);
    expect(clearedAgain.todo.completed).toBe(false);
  });

  it("concurrent setCompleted(true) settles completed (no cancel-out)", async () => {
    const todo = await manager.create("Race me");
    await Promise.all([
      manager.setCompleted(todo.id, true),
      manager.setCompleted(todo.id, true),
      manager.setCompleted(todo.id, true),
    ]);
    const stored = await manager.list();
    expect(stored[0].completed).toBe(true);
  });

  it("concurrent blind toggles can cancel out (documents the race)", async () => {
    const todo = await manager.create("Flip flop");
    // Two sequential toggles always cancel; concurrent may or may not depending on interleaving.
    await manager.toggle(todo.id);
    await manager.toggle(todo.id);
    const stored = await manager.list();
    expect(stored[0].completed).toBe(false);

    // Explicit desired state after a flip-flop still wins:
    await Promise.all([
      manager.setCompleted(todo.id, true),
      manager.setCompleted(todo.id, true),
    ]);
    const after = await manager.list();
    expect(after[0].completed).toBe(true);
  });

  it("recurring setCompleted(true) reschedules and reports feedback", async () => {
    const now = Date.now();
    const todo = await manager.create("Daily", "none", now, undefined, "daily");
    const result = await manager.setCompleted(todo.id, true);
    expect(result.rescheduled).toBe(true);
    expect(result.todo.completed).toBe(false);
    expect(result.todo.reminderAt).toBe(now + 24 * 60 * 60 * 1000);
    expect(formatRescheduledToast(result.todo.reminderAt!)).toMatch(/^Rescheduled for /);
  });

  it("applySetCompletedLocal matches server recurring behavior", () => {
    const now = 1_700_000_000_000;
    const local = applySetCompletedLocal(
      { completed: false, reminderAt: now, reminderSent: false, recurrence: "weekly" },
      true
    );
    expect(local.rescheduled).toBe(true);
    expect(local.todo.completed).toBe(false);
    expect(local.todo.reminderAt).toBe(now + 7 * 24 * 60 * 60 * 1000);
  });
});
