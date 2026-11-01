import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { getOptionalUser } from "../app/auth.server";
import {
  GUEST_REMINDER_DENIAL,
  GUEST_SHARED_LIST_INTENTS,
  deleteExpiredGuestLists,
  guestIntentDenial,
  isGuestId,
  isListFull,
} from "../app/guest-access.server";
import { MAX_TASK_TEXT_LENGTH, MAX_TASKS_PER_LIST, taskTextError } from "../app/write-limits";

const GUEST = "guest_0b6f3c1e-2d4a-4f5b-9c8d-7e6f5a4b3c2d";
const DAY_MS = 86_400_000;

async function insertList(id: string, ownerId: string, createdAt: number, ttl: number | null = null) {
  await env.DB.prepare(
    "INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl, share_mode) VALUES (?, ?, ?, ?, ?, 'public_edit')"
  )
    .bind(id, id, ownerId, createdAt, ttl)
    .run();
}

async function insertTodo(id: string, listId: string) {
  await env.DB.prepare("INSERT INTO todos (id, list_id, text, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, listId, id, Date.now())
    .run();
}

async function listIds(): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT id FROM lists ORDER BY id").all<{ id: string }>();
  return results.map((r) => r.id);
}

describe("guest sessions", () => {
  it("only accepts guest ids the app minted", () => {
    expect(isGuestId(GUEST)).toBe(true);
    expect(isGuestId(`guest_${crypto.randomUUID()}`)).toBe(true);
    expect(isGuestId("1")).toBe(false);
    expect(isGuestId("guest_1")).toBe(false);
    expect(isGuestId(`${GUEST}x`)).toBe(false);
  });

  it("replaces a guest cookie that isn't a guest id with a new guest id", async () => {
    const kept = await getOptionalUser(
      new Request("https://synx.christran.io/", { headers: { Cookie: `guest_session=${GUEST}` } }),
      {}
    );
    expect(kept).toMatchObject({ userId: GUEST, isLoggedIn: false, isNewGuest: false });

    const replaced = await getOptionalUser(
      new Request("https://synx.christran.io/", { headers: { Cookie: "guest_session=user-owner-123" } }),
      {}
    );
    expect(replaced.isLoggedIn).toBe(false);
    expect(replaced.isNewGuest).toBe(true);
    expect(replaced.userId).not.toBe("user-owner-123");
    expect(isGuestId(replaced.userId)).toBe(true);
  });
});

describe("guest writes on shared lists", () => {
  it("disallows all write intents on shared lists for guests", () => {
    expect(GUEST_SHARED_LIST_INTENTS.size).toBe(0);
    for (const intent of [
      "create",
      "toggle",
      "setCompleted",
      "delete",
      "updatePriority",
      "updateText",
      "updateDuration",
      "clearCompleted",
      "deleteList",
      "createList",
      "updateReminder",
      "updateRecurrence",
      "markReminderSent",
      "updateShareMode",
    ]) {
      expect(GUEST_SHARED_LIST_INTENTS.has(intent)).toBe(false);
    }
    expect(guestIntentDenial("updateReminder")).toBe(GUEST_REMINDER_DENIAL);
    expect(guestIntentDenial("createList")).toMatch(/sign in/i);
    expect(guestIntentDenial("create")).toBe("Sign in to edit this list.");
  });
});

describe("write limits", () => {
  afterEach(async () => {
    await env.DB.exec("DELETE FROM todos");
    await env.DB.exec("DELETE FROM lists");
  });

  it("rejects task text over the limit", () => {
    expect(taskTextError("a".repeat(MAX_TASK_TEXT_LENGTH))).toBeNull();
    expect(taskTextError("a".repeat(MAX_TASK_TEXT_LENGTH + 1))).toMatch(/up to/);
  });

  it("reports a list as full at the task limit", async () => {
    await insertList("full-list", "user-owner-123", Date.now());
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO todos (id, list_id, text, created_at) SELECT 't' || i, 'full-list', 't', 0 FROM n`
    )
      .bind(MAX_TASKS_PER_LIST - 1)
      .run();
    expect(await isListFull(env.DB, "full-list")).toBe(false);
    await insertTodo("last", "full-list");
    expect(await isListFull(env.DB, "full-list")).toBe(true);
  });
});

describe("guest list cleanup", () => {
  const now = Date.now();

  beforeEach(async () => {
    await insertList("guest-expired", GUEST, now - 2 * DAY_MS, 86400);
    await insertList("guest-fresh", GUEST, now - 60_000, 86400);
    await insertList("user-old", "user-owner-123", now - 30 * DAY_MS, null);
    await insertList("lookalike", "guest_not-a-uuid", now - 30 * DAY_MS, 86400);
    await insertTodo("guest-task", "guest-expired");
    await insertTodo("user-task", "user-old");
    await env.DB.prepare("INSERT INTO shared_list_access (user_id, list_id, opened_at) VALUES ('user-owner-123', 'guest-expired', 0)").run();
  });

  afterEach(async () => {
    await env.DB.exec("DELETE FROM shared_list_access");
    await env.DB.exec("DELETE FROM todos");
    await env.DB.exec("DELETE FROM lists");
  });

  it("cron deletes only expired guest-owned lists and their rows", async () => {
    expect(await deleteExpiredGuestLists(env.DB, now)).toBe(1);
    expect(await listIds()).toEqual(["guest-fresh", "lookalike", "user-old"]);
    const todos = await env.DB.prepare("SELECT id FROM todos").all<{ id: string }>();
    expect(todos.results.map((t) => t.id)).toEqual(["user-task"]);
    const access = await env.DB.prepare("SELECT COUNT(*) AS n FROM shared_list_access").first<{ n: number }>();
    expect(access?.n).toBe(0);
  });

  it("migration 0002 deletes every guest-owned list and nothing else", async () => {
    const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0002_"));
    expect(migration).toBeDefined();
    for (const query of migration!.queries) {
      await env.DB.prepare(query).run();
    }
    expect(await listIds()).toEqual(["lookalike", "user-old"]);
    const todos = await env.DB.prepare("SELECT id FROM todos").all<{ id: string }>();
    expect(todos.results.map((t) => t.id)).toEqual(["user-task"]);
  });
});
