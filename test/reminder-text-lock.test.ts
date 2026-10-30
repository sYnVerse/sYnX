import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { env } from "cloudflare:test";
import { action as todoAction } from "../app/routes/api.v1.todos.$id";
import { canEditReminderText } from "../app/reminder-ownership";

// Skip real token verification; each test picks who is signed in.
const auth = vi.hoisted(() => ({ userId: "owner-user" }));
vi.mock("../app/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth.server")>();
  return {
    ...actual,
    verifyBearerToken: vi.fn(async () => ({
      userId: auth.userId,
      email: `${auth.userId}@example.com`,
      token: "test-token",
    })),
  };
});

const OWNER = "owner-user";
const USER_A = "collab-a";
const USER_B = "collab-b";
const LIST_ID = "shared-reminder-list";

function putTodo(userId: string, todoId: string, body: Record<string, unknown>): Promise<Response> {
  auth.userId = userId;
  const args = {
    request: new Request(`https://synx.test/api/v1/todos/${todoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify(body),
    }),
    params: { id: todoId },
    context: { cloudflare: { env } },
  } as unknown as ActionFunctionArgs;
  return todoAction(args);
}

async function textOf(todoId: string): Promise<string | undefined> {
  const row = await env.DB.prepare("SELECT text FROM todos WHERE id = ?").bind(todoId).first<{ text: string }>();
  return row?.text;
}

describe("canEditReminderText", () => {
  it("lets only the user who set the reminder edit the text", () => {
    expect(canEditReminderText(USER_A, OWNER, USER_A)).toBe(true);
    expect(canEditReminderText(USER_A, OWNER, USER_B)).toBe(false);
    expect(canEditReminderText(USER_A, OWNER, OWNER)).toBe(false);
  });

  it("falls back to the list owner for legacy reminders with no setter", () => {
    expect(canEditReminderText(null, OWNER, OWNER)).toBe(true);
    expect(canEditReminderText(null, OWNER, USER_A)).toBe(false);
    expect(canEditReminderText(undefined, OWNER, USER_A)).toBe(false);
  });

  it("allows the edit when no one owns the reminder", () => {
    expect(canEditReminderText(null, null, USER_A)).toBe(true);
  });
});

describe("PUT /api/v1/todos/:id locked reminder text", () => {
  const reminderAt = Date.now() + 60 * 60 * 1000;

  beforeEach(async () => {
    const db = env.DB;
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'public_edit')")
      .bind(LIST_ID, "Shared", OWNER, Date.now())
      .run();
    const insert =
      "INSERT INTO todos (id, list_id, text, created_at, reminder_at, reminder_sent, reminder_user_id) VALUES (?, ?, ?, ?, ?, 0, ?)";
    await db.prepare(insert).bind("set-by-a", LIST_ID, "A's reminder", Date.now(), reminderAt, USER_A).run();
    await db.prepare(insert).bind("legacy", LIST_ID, "Legacy reminder", Date.now(), reminderAt, null).run();
  });

  afterEach(async () => {
    await env.DB.exec("DELETE FROM list_activity");
    await env.DB.exec("DELETE FROM todos");
    await env.DB.exec("DELETE FROM lists");
  });

  it("returns 403 when another collaborator rewords a reminder set by someone else", async () => {
    const res = await putTodo(USER_B, "set-by-a", { text: "Changed by B" });
    expect(res.status).toBe(403);
    expect(await textOf("set-by-a")).toBe("A's reminder");
  });

  it("lets the user who set the reminder change the text", async () => {
    const res = await putTodo(USER_A, "set-by-a", { text: "Changed by A" });
    expect(res.status).toBe(200);
    expect(await textOf("set-by-a")).toBe("Changed by A");
  });

  it("treats a legacy reminder as the list owner's", async () => {
    const denied = await putTodo(USER_A, "legacy", { text: "Changed by A" });
    expect(denied.status).toBe(403);
    expect(await textOf("legacy")).toBe("Legacy reminder");

    const allowed = await putTodo(OWNER, "legacy", { text: "Changed by owner" });
    expect(allowed.status).toBe(200);
    expect(await textOf("legacy")).toBe("Changed by owner");
  });
});
