import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { env } from "cloudflare:test";
import { action as todosAction } from "../app/routes/api.v1.todos";

// Skip real token verification: every request is the list owner below.
vi.mock("../app/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth.server")>();
  return {
    ...actual,
    verifyBearerToken: vi.fn(async () => ({
      userId: "parent-check-owner",
      email: "owner@example.com",
      token: "test-token",
    })),
  };
});

const OWNER_ID = "parent-check-owner";

function createTodo(body: Record<string, unknown>): Promise<Response> {
  const args = {
    request: new Request("https://synx.test/api/v1/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify(body),
    }),
    params: {},
    context: { cloudflare: { env } },
  } as unknown as ActionFunctionArgs;
  return todosAction(args);
}

describe("POST /api/v1/todos subtask parent check", () => {
  let db: D1Database;

  beforeEach(async () => {
    db = env.DB;
    const insertList =
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'private')";
    await db.prepare(insertList).bind("list-a", "List A", OWNER_ID, Date.now()).run();
    await db.prepare(insertList).bind("list-b", "List B", OWNER_ID, Date.now()).run();
    const insertTodo = "INSERT INTO todos (id, list_id, text, created_at) VALUES (?, ?, ?, ?)";
    await db.prepare(insertTodo).bind("parent-a", "list-a", "Parent in A", Date.now()).run();
    await db.prepare(insertTodo).bind("parent-b", "list-b", "Parent in B", Date.now()).run();
  });

  afterEach(async () => {
    await db.exec("DELETE FROM list_activity");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
  });

  it("rejects a parent task from another list", async () => {
    const res = await createTodo({ listId: "list-a", text: "Subtask", parentId: "parent-b" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Parent task not found" });

    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM todos WHERE text = 'Subtask'")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("rejects a parent task that doesn't exist", async () => {
    const res = await createTodo({ listId: "list-a", text: "Subtask", parentId: "missing-task" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Parent task not found" });
  });

  it("creates the subtask when the parent is in the same list", async () => {
    const res = await createTodo({ listId: "list-a", text: "Subtask", parentId: "parent-a" });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { success: boolean; todo: { id: string } };
    expect(payload.success).toBe(true);

    const row = await db
      .prepare("SELECT list_id, parent_id FROM todos WHERE id = ?")
      .bind(payload.todo.id)
      .first<{ list_id: string; parent_id: string | null }>();
    expect(row).toEqual({ list_id: "list-a", parent_id: "parent-a" });
  });
});
