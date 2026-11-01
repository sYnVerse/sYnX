import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import {
  deleteRequestActivitySummary,
  listActivityForOwner,
  logListActivity,
} from "../app/list-activity.server";

const ownerId = "user-owner-activity";
const collaboratorId = "user-collab-activity";
const guestId = "guest_abcdef12-3456-7890-abcd-ef1234567890";

async function seedSharedList(listId: string, shareMode = "public_edit") {
  await env.DB.prepare(
    "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(listId, "Shared Activity List", ownerId, Date.now(), shareMode)
    .run();
}

describe("list activity log", () => {
  let db: D1Database;

  beforeEach(async () => {
    db = env.DB;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM list_activity");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
    await db.exec("DELETE FROM user_settings");
  });

  it("only the list owner can read the activity log", async () => {
    const listId = "list-activity-owner-only";
    await seedSharedList(listId);

    await logListActivity(db, {
      listId,
      action: "task_created",
      actorId: collaboratorId,
      isOwner: false,
      shareMode: "public_edit",
      clientIp: "198.51.100.20",
      summary: "Hello",
    });

    const asOwner = await listActivityForOwner(db, listId, ownerId);
    expect(asOwner.kind).toBe("ok");
    if (asOwner.kind !== "ok") return;
    expect(asOwner.entries).toHaveLength(1);
    expect(asOwner.entries[0].clientIp).toBe("198.51.100.20");

    const asCollaborator = await listActivityForOwner(db, listId, collaboratorId);
    expect(asCollaborator.kind).toBe("forbidden");
  });

  it("logs a guest delete request with guest label and IP", async () => {
    const listId = "list-activity-guest-delete";
    const todoId = "todo-activity-guest-delete";
    await seedSharedList(listId);
    await db
      .prepare(
        "INSERT INTO todos (id, list_id, text, completed, created_at) VALUES (?, ?, ?, 0, ?)"
      )
      .bind(todoId, listId, "Buy milk", Date.now())
      .run();

    await logListActivity(db, {
      listId,
      taskId: todoId,
      action: "delete_requested",
      actorId: guestId,
      isOwner: false,
      shareMode: "public_edit",
      clientIp: "203.0.113.10",
      userAgent: "TestAgent/1.0",
      summary: deleteRequestActivitySummary("task", "Buy milk"),
    });

    const result = await listActivityForOwner(db, listId, ownerId);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.action).toBe("delete_requested");
    expect(entry.actorType).toBe("guest");
    expect(entry.actorLabel).toBe("Guest · abcdef12");
    expect(entry.clientIp).toBe("203.0.113.10");
    expect(entry.summary).toContain("Buy milk");
    expect(entry.taskId).toBe(todoId);
  });

  it("skips logging for private lists", async () => {
    const listId = "list-activity-private";
    await seedSharedList(listId, "private");

    await logListActivity(db, {
      listId,
      action: "task_created",
      actorId: ownerId,
      isOwner: true,
      shareMode: "private",
      summary: "Should not appear",
    });

    const row = await db
      .prepare("SELECT COUNT(*) AS c FROM list_activity WHERE list_id = ?")
      .bind(listId)
      .first<{ c: number }>();
    expect(Number(row?.c || 0)).toBe(0);
  });

  it("logs task_completed when completing or rescheduling a recurring task", async () => {
    const listId = "list-activity-rescheduled";
    const todoId = "todo-activity-rescheduled";
    await seedSharedList(listId);

    const toggled = { completed: false, rescheduled: true };
    const action = toggled.completed || toggled.rescheduled ? "task_completed" : "task_uncompleted";

    await logListActivity(db, {
      listId,
      taskId: todoId,
      action,
      actorId: collaboratorId,
      isOwner: false,
      shareMode: "public_edit",
      summary: "Repeating workout",
    });

    const asOwner = await listActivityForOwner(db, listId, ownerId);
    expect(asOwner.kind).toBe("ok");
    if (asOwner.kind !== "ok") return;
    expect(asOwner.entries).toHaveLength(1);
    expect(asOwner.entries[0].action).toBe("task_completed");
  });
});
