import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { env as workerEnv } from "cloudflare:test";
import { buildListWidgetSnapshot, type TodoItem, type TodoList } from "../shared";
import { handleApiRequest } from "../backend/api/router";
import { cloudflareContext } from "../backend/services/context.server";
import * as authContext from "../backend/services/auth-context.server";
import { TodoManager } from "../backend/services/to-do-manager";
import { action as listAction } from "../web/app/features/list/action.server";
import { loader as listLoader } from "../web/app/features/list/loader.server";

const OWNER = { userId: "sort-owner", email: "sort-owner@example.com" };
const COLLAB = { userId: "sort-collab", email: "sort-collab@example.com" };
const OUTSIDER = { userId: "sort-outsider", email: "sort-outsider@example.com" };

let currentWebAuth = {
  userId: OWNER.userId,
  email: OWNER.email,
  isLoggedIn: true,
  guestId: null as string | null,
  isNewGuest: false,
  accessToken: "token-owner" as string | null,
};

let currentApiUser: { userId: string; email: string; token: string } | null = {
  userId: OWNER.userId,
  email: OWNER.email,
  token: "token-owner",
};

function makeContext(envOverrides: Record<string, unknown> = {}): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, {
    env: { DB: workerEnv.DB, ...envOverrides } as unknown as Env,
    ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
  });
  return provider;
}

const BACKFILL_SORT_ORDER_SQL = `
UPDATE todos
SET sort_order = (
  SELECT COUNT(*)
  FROM todos AS other
  WHERE other.list_id = todos.list_id
    AND (
      (todos.parent_id IS NULL AND other.parent_id IS NULL)
      OR other.parent_id = todos.parent_id
    )
    AND (
      other.created_at > todos.created_at
      OR (other.created_at = todos.created_at AND other.id < todos.id)
    )
)
WHERE sort_order IS NULL;
`;

describe("Issue #212 task sort_order D1 migration semantics, API, web actions & widget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    currentWebAuth = {
      userId: OWNER.userId,
      email: OWNER.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      accessToken: "token-owner",
    };
    currentApiUser = {
      userId: OWNER.userId,
      email: OWNER.email,
      token: "token-owner",
    };
    vi.spyOn(authContext, "getRequestWebAuth").mockImplementation(async () => currentWebAuth);
    vi.spyOn(authContext, "getRequestApiAuth").mockImplementation(async () => currentApiUser);
  });

  afterEach(async () => {
    await workerEnv.DB.exec("DELETE FROM list_archives");
    await workerEnv.DB.exec("DELETE FROM shared_list_access");
    await workerEnv.DB.exec("DELETE FROM list_activity");
    await workerEnv.DB.exec("DELETE FROM task_completions");
    await workerEnv.DB.exec("DELETE FROM todos");
    await workerEnv.DB.exec("DELETE FROM lists");
    await workerEnv.DB.exec("DELETE FROM user_settings");
  });

  it("backfills null sort_order deterministically per (list_id, parent_id) scope", async () => {
    const now = Date.now();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("bf-1", "Backfill One", OWNER.userId, now, "private").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("bf-2", "Backfill Two", OWNER.userId, now, "private").run();

    // Insert with explicit NULL sort_order across same timestamp ties and multiple scopes
    await workerEnv.DB.prepare(
      "INSERT INTO todos (id, list_id, text, completed, created_at, priority, parent_id, sort_order) VALUES (?, ?, ?, 0, ?, 'none', NULL, NULL)"
    ).bind("t-oldest", "bf-1", "Oldest", 1000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO todos (id, list_id, text, completed, created_at, priority, parent_id, sort_order) VALUES (?, ?, ?, 0, ?, 'none', NULL, NULL)"
    ).bind("t-tie-b", "bf-1", "Tie B", 2000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO todos (id, list_id, text, completed, created_at, priority, parent_id, sort_order) VALUES (?, ?, ?, 0, ?, 'none', NULL, NULL)"
    ).bind("t-tie-a", "bf-1", "Tie A", 2000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO todos (id, list_id, text, completed, created_at, priority, parent_id, sort_order) VALUES (?, ?, ?, 0, ?, 'none', 't-tie-a', NULL)"
    ).bind("sub-old", "bf-1", "Sub Old", 1000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO todos (id, list_id, text, completed, created_at, priority, parent_id, sort_order) VALUES (?, ?, ?, 0, ?, 'none', 't-tie-a', NULL)"
    ).bind("sub-new", "bf-1", "Sub New", 3000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO todos (id, list_id, text, completed, created_at, priority, parent_id, sort_order) VALUES (?, ?, ?, 0, ?, 'none', NULL, NULL)"
    ).bind("other-list-task", "bf-2", "Other List", 5000).run();

    await workerEnv.DB.prepare(BACKFILL_SORT_ORDER_SQL).run();

    const { results: bf1Top } = await workerEnv.DB.prepare(
      "SELECT id, sort_order FROM todos WHERE list_id = 'bf-1' AND parent_id IS NULL ORDER BY sort_order ASC"
    ).all<{ id: string; sort_order: number }>();
    expect(bf1Top).toEqual([
      { id: "t-tie-a", sort_order: 0 },
      { id: "t-tie-b", sort_order: 1 },
      { id: "t-oldest", sort_order: 2 },
    ]);

    const { results: bf1Subs } = await workerEnv.DB.prepare(
      "SELECT id, sort_order FROM todos WHERE list_id = 'bf-1' AND parent_id = 't-tie-a' ORDER BY sort_order ASC"
    ).all<{ id: string; sort_order: number }>();
    expect(bf1Subs).toEqual([
      { id: "sub-new", sort_order: 0 },
      { id: "sub-old", sort_order: 1 },
    ]);

    const other = await workerEnv.DB.prepare(
      "SELECT sort_order FROM todos WHERE id = 'other-list-task'"
    ).first<{ sort_order: number }>();
    expect(other?.sort_order).toBe(0);
  });

  it("prepends newly created tasks and subtasks to the top of their scope via MIN(sort_order) - 1", async () => {
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("create-1", "Create List", OWNER.userId, Date.now(), "private").run();

    const manager = new TodoManager(workerEnv.DB, "create-1");
    const first = await manager.create("First", "none", undefined, undefined, "none", null, null, OWNER.userId);
    const second = await manager.create("Second", "none", undefined, undefined, "none", null, null, OWNER.userId);
    const third = await manager.create("Third", "none", undefined, undefined, "none", null, null, OWNER.userId);

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(-1);
    expect(third.sortOrder).toBe(-2);

    // Subtask scope starts independently at 0 then decrements
    const subFirst = await manager.create("Sub First", "none", undefined, first.id, "none", null, null, OWNER.userId);
    const subSecond = await manager.create("Sub Second", "none", undefined, first.id, "none", null, null, OWNER.userId);
    expect(subFirst.sortOrder).toBe(0);
    expect(subSecond.sortOrder).toBe(-1);

    const listed = await manager.list();
    expect(listed.filter((t) => !t.parentId).map((t) => t.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
    expect(listed.filter((t) => t.parentId === first.id).map((t) => t.id)).toEqual([
      subSecond.id,
      subFirst.id,
    ]);
  });

  it("enforces auth, permissions, validation, slot-preserving subset merge & subtask scope on POST /api/v1/todos/reorder", async () => {
    const now = Date.now();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("priv-1", "Private", OWNER.userId, now - 3000, "private").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("read-1", "Public Read", OWNER.userId, now - 2000, "public_read").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("edit-1", "Public Edit", OWNER.userId, now - 1000, "public_edit").run();

    const privManager = new TodoManager(workerEnv.DB, "priv-1");
    const t1 = await privManager.create("Task 1");
    const t2 = await privManager.create("Task 2");
    const t3 = await privManager.create("Task 3");
    const t4 = await privManager.create("Task 4");
    const sub1 = await privManager.create("Sub 1", "none", undefined, t1.id);
    const sub2 = await privManager.create("Sub 2", "none", undefined, t1.id);

    const readManager = new TodoManager(workerEnv.DB, "read-1");
    const r1 = await readManager.create("Read 1");
    const r2 = await readManager.create("Read 2");

    const editManager = new TodoManager(workerEnv.DB, "edit-1");
    const e1 = await editManager.create("Edit 1");
    const e2 = await editManager.create("Edit 2");

    // 1. Unauthenticated -> 401
    currentApiUser = null;
    const unauthRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: null, orderedIds: [t1.id, t4.id] }),
      }),
      makeContext(),
    );
    expect(unauthRes?.status).toBe(401);

    // 2. Outsider on private list -> 403
    currentApiUser = { userId: OUTSIDER.userId, email: OUTSIDER.email, token: "tok-out" };
    const privForbidden = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: null, orderedIds: [t1.id, t4.id] }),
      }),
      makeContext(),
    );
    expect(privForbidden?.status).toBe(403);

    // 3. Collaborator on public_read list -> 403
    currentApiUser = { userId: COLLAB.userId, email: COLLAB.email, token: "tok-collab" };
    const readForbidden = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "read-1", parentId: null, orderedIds: [r1.id, r2.id] }),
      }),
      makeContext(),
    );
    expect(readForbidden?.status).toBe(403);

    // 4. Collaborator on public_edit list -> 200 with dense 0..n-1
    const editOk = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "edit-1", parentId: null, orderedIds: [e1.id, e2.id] }),
      }),
      makeContext(),
    );
    expect(editOk?.status).toBe(200);
    const editJson = (await editOk?.json()) as { success: boolean; todos: TodoItem[] };
    expect(editJson.success).toBe(true);
    expect(editJson.todos.map((t) => [t.id, t.sortOrder])).toEqual([
      [e1.id, 0],
      [e2.id, 1],
    ]);

    // 5. Missing list -> 404
    currentApiUser = { userId: OWNER.userId, email: OWNER.email, token: "token-owner" };
    const missingList = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "no-such-list", parentId: null, orderedIds: [t1.id] }),
      }),
      makeContext(),
    );
    expect(missingList?.status).toBe(404);

    // 6. Owner subset slot-preserving reorder on priv-1 (initial top-level order: t4, t3, t2, t1)
    // Reorder subset [t2, t3] -> slots 1 & 2 swap, keeping t4 at 0 and t1 at 3!
    const subsetRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: null, orderedIds: [t2.id, t3.id] }),
      }),
      makeContext(),
    );
    expect(subsetRes?.status).toBe(200);
    const subsetJson = (await subsetRes?.json()) as { success: boolean; todos: TodoItem[] };
    expect(subsetJson.todos.filter((t) => !t.parentId).map((t) => [t.id, t.sortOrder])).toEqual([
      [t4.id, 0],
      [t2.id, 1],
      [t3.id, 2],
      [t1.id, 3],
    ]);

    // 7. Owner subtask reorder scoped to t1 does not alter top-level sort_order
    const subRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: t1.id, orderedIds: [sub1.id, sub2.id] }),
      }),
      makeContext(),
    );
    expect(subRes?.status).toBe(200);
    const subJson = (await subRes?.json()) as { success: boolean; todos: TodoItem[] };
    expect(subJson.todos.filter((t) => t.parentId === t1.id).map((t) => [t.id, t.sortOrder])).toEqual([
      [sub1.id, 0],
      [sub2.id, 1],
    ]);

    // 8. Validation failures -> 400 (cross-list, cross-parent, duplicates, missing parent)
    const crossList = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: null, orderedIds: [e1.id] }),
      }),
      makeContext(),
    );
    expect(crossList?.status).toBe(400);

    const crossParent = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: null, orderedIds: [sub1.id] }),
      }),
      makeContext(),
    );
    expect(crossParent?.status).toBe(400);

    const dupIds = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: null, orderedIds: [t1.id, t1.id] }),
      }),
      makeContext(),
    );
    expect(dupIds?.status).toBe(400);

    const badParent = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "priv-1", parentId: "missing-parent", orderedIds: [sub1.id] }),
      }),
      makeContext(),
    );
    expect(badParent?.status).toBe(400);
  });

  it("promotes open subtasks to the top of the top-level list preserving their relative sortOrder", async () => {
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("promo-1", "Promote List", OWNER.userId, Date.now(), "private").run();

    const manager = new TodoManager(workerEnv.DB, "promo-1");
    const parent = await manager.create("Parent");
    const otherTop = await manager.create("Other Top");
    const s1 = await manager.create("Sub A", "none", undefined, parent.id);
    const s2 = await manager.create("Sub B", "none", undefined, parent.id);
    const s3 = await manager.create("Sub C", "none", undefined, parent.id);

    // Custom order subtasks: [s1, s3, s2]
    await manager.reorder([s1.id, s3.id, s2.id], parent.id);

    const res = await manager.setCompleted(parent.id, true, {
      userId: OWNER.userId,
      isOwner: true,
      subtaskAction: "promote",
    });

    expect(res.updatedSubtasks?.map((s) => s.id)).toEqual([s1.id, s3.id, s2.id]);
    const listed = await manager.list();
    // Promoted subtasks should appear before existing top-level items (otherTop & parent)
    expect(listed.map((t) => t.id)).toEqual([s1.id, s3.id, s2.id, otherTop.id, parent.id]);
  });

  it("handles web reorderTasks action and returns sorted sortOrder from listLoader", async () => {
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("web-sort-1", "Web Sort", OWNER.userId, Date.now(), "private").run();

    const manager = new TodoManager(workerEnv.DB, "web-sort-1");
    const a = await manager.create("Alpha");
    const b = await manager.create("Beta");
    const c = await manager.create("Gamma");
    const subA = await manager.create("Sub A", "none", undefined, a.id);
    const subB = await manager.create("Sub B", "none", undefined, a.id);

    const reorderTopForm = new FormData();
    reorderTopForm.set("intent", "reorderTasks");
    reorderTopForm.set("orderedIds", JSON.stringify([a.id, b.id, c.id]));
    const actionRes = (await listAction({
      request: new Request("https://synx.test/web-sort-1", { method: "POST", body: reorderTopForm }),
      params: { id: "web-sort-1" },
      context: makeContext(),
    } as unknown as Parameters<typeof listAction>[0])) as { success: boolean; todos: TodoItem[] };
    expect(actionRes.success).toBe(true);

    const reorderSubForm = new FormData();
    reorderSubForm.set("intent", "reorderTasks");
    reorderSubForm.set("parentId", a.id);
    reorderSubForm.set("orderedIds", JSON.stringify([subA.id, subB.id]));
    const subActionRes = (await listAction({
      request: new Request("https://synx.test/web-sort-1", { method: "POST", body: reorderSubForm }),
      params: { id: "web-sort-1" },
      context: makeContext(),
    } as unknown as Parameters<typeof listAction>[0])) as { success: boolean };
    expect(subActionRes.success).toBe(true);

    const loaded = (await listLoader({
      request: new Request("https://synx.test/web-sort-1"),
      params: { id: "web-sort-1" },
      context: makeContext(),
    } as unknown as Parameters<typeof listLoader>[0])) as {
      todos: Array<{ id: string; parentId?: string; sortOrder?: number }>;
    };

    expect(loaded.todos.filter((t) => !t.parentId).map((t) => [t.id, t.sortOrder])).toEqual([
      [a.id, 0],
      [b.id, 1],
      [c.id, 2],
    ]);
    expect(
      loaded.todos.filter((t) => t.parentId === a.id).map((t) => [t.id, t.sortOrder]),
    ).toEqual([
      [subA.id, 0],
      [subB.id, 1],
    ]);
  });

  it("buildListWidgetSnapshot respects manual sortMode and sortOrder tiebreaking", () => {
    const listMeta: TodoList = {
      id: "w-1",
      name: "Widget List",
      ownerId: OWNER.userId,
      createdAt: 1000,
      shareMode: "private",
    };
    const todos: TodoItem[] = [
      {
        id: "t1",
        listId: "w-1",
        text: "First added high",
        completed: false,
        createdAt: 100,
        priority: "high",
        reminderSent: false,
        recurrence: "none",
        sortOrder: 2,
      },
      {
        id: "t2",
        listId: "w-1",
        text: "Second none sort0",
        completed: false,
        createdAt: 200,
        priority: "none",
        reminderSent: false,
        recurrence: "none",
        sortOrder: 0,
      },
      {
        id: "t3",
        listId: "w-1",
        text: "Third high sort1",
        completed: false,
        createdAt: 300,
        priority: "high",
        reminderSent: false,
        recurrence: "none",
        sortOrder: 1,
      },
    ];

    const manualSnap = buildListWidgetSnapshot(listMeta, todos, { sortMode: "manual" });
    expect(manualSnap.tasks.map((t) => t.id)).toEqual(["t2", "t3", "t1"]);

    // In priority mode, t3 and t1 tie on high -> sortOrder 1 precedes sortOrder 2 even though t2 is first manually
    const prioSnap = buildListWidgetSnapshot(listMeta, todos, { sortMode: "priority" });
    expect(prioSnap.tasks.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });
});
