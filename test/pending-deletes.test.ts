import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import {
  approvePendingDelete,
  declinePendingDelete,
  listPendingDeletesForList,
  requestOrPerformDelete,
} from "../app/pending-deletes.server";

const ownerId = "user-owner-pending";
const collaboratorId = "user-collab-pending";
const viewerId = "user-viewer-pending";

async function seedCollaborativeList(listId: string) {
  await env.DB.prepare(
    "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(listId, "Collab List", ownerId, Date.now(), "public_edit")
    .run();
}

async function seedTodo(todoId: string, listId: string, text = "Task") {
  await env.DB.prepare(
    "INSERT INTO todos (id, list_id, text, completed, created_at) VALUES (?, ?, ?, 0, ?)"
  )
    .bind(todoId, listId, text, Date.now())
    .run();
}

describe("pending delete requests (collaborative lists)", () => {
  let db: D1Database;

  beforeEach(async () => {
    db = env.DB;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM pending_delete_requests");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
    await db.exec("DELETE FROM device_tokens");
  });

  it("lets the owner delete a task immediately", async () => {
    const listId = "list-owner-delete";
    const todoId = "todo-owner-delete";
    await seedCollaborativeList(listId);
    await seedTodo(todoId, listId);

    const result = await requestOrPerformDelete(db, {
      listId,
      userId: ownerId,
      isOwner: true,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });

    expect(result.kind).toBe("deleted");
    const remaining = await db
      .prepare("SELECT id FROM todos WHERE id = ?")
      .bind(todoId)
      .first();
    expect(remaining).toBeNull();
  });

  it("turns a collaborator task delete into a pending request", async () => {
    const listId = "list-collab-delete";
    const todoId = "todo-collab-delete";
    await seedCollaborativeList(listId);
    await seedTodo(todoId, listId, "Buy milk");

    const result = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });

    expect(result.kind).toBe("requested");
    if (result.kind !== "requested") return;
    expect(result.alreadyExisted).toBe(false);

    const todo = await db.prepare("SELECT id FROM todos WHERE id = ?").bind(todoId).first();
    expect(todo).not.toBeNull();

    const pending = await listPendingDeletesForList(db, listId);
    expect(pending).toHaveLength(1);
    expect(pending[0].targetType).toBe("task");
    expect(pending[0].targetId).toBe(todoId);
    expect(pending[0].targetLabel).toBe("Buy milk");
    expect(pending[0].requesterId).toBe(collaboratorId);
  });

  it("does not create duplicate pending requests for the same task", async () => {
    const listId = "list-dup-delete";
    const todoId = "todo-dup-delete";
    await seedCollaborativeList(listId);
    await seedTodo(todoId, listId);

    const first = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });
    const second = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });

    expect(first.kind).toBe("requested");
    expect(second.kind).toBe("requested");
    if (first.kind !== "requested" || second.kind !== "requested") return;
    expect(second.alreadyExisted).toBe(true);
    expect(second.requestId).toBe(first.requestId);

    const pending = await listPendingDeletesForList(db, listId);
    expect(pending).toHaveLength(1);
  });

  it("forbids view-only users from deleting or requesting deletes", async () => {
    const listId = "list-view-only";
    const todoId = "todo-view-only";
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(listId, "View Only", ownerId, Date.now(), "public_read")
      .run();
    await seedTodo(todoId, listId);

    const result = await requestOrPerformDelete(db, {
      listId,
      userId: viewerId,
      isOwner: false,
      canEdit: false,
      targetType: "task",
      targetId: todoId,
    });

    expect(result.kind).toBe("forbidden");
    const pending = await listPendingDeletesForList(db, listId);
    expect(pending).toHaveLength(0);
  });

  it("lets the owner approve a pending task delete", async () => {
    const listId = "list-approve";
    const todoId = "todo-approve";
    await seedCollaborativeList(listId);
    await seedTodo(todoId, listId);

    const requested = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });
    expect(requested.kind).toBe("requested");
    if (requested.kind !== "requested") return;

    const approved = await approvePendingDelete(db, requested.requestId, ownerId);
    expect(approved.kind).toBe("approved");

    const todo = await db.prepare("SELECT id FROM todos WHERE id = ?").bind(todoId).first();
    expect(todo).toBeNull();
    expect(await listPendingDeletesForList(db, listId)).toHaveLength(0);
  });

  it("lets the owner decline a pending task delete without removing the task", async () => {
    const listId = "list-decline";
    const todoId = "todo-decline";
    await seedCollaborativeList(listId);
    await seedTodo(todoId, listId);

    const requested = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });
    expect(requested.kind).toBe("requested");
    if (requested.kind !== "requested") return;

    const declined = await declinePendingDelete(db, requested.requestId, ownerId);
    expect(declined.kind).toBe("declined");

    const todo = await db.prepare("SELECT id FROM todos WHERE id = ?").bind(todoId).first();
    expect(todo).not.toBeNull();
    expect(await listPendingDeletesForList(db, listId)).toHaveLength(0);
  });

  it("rejects approve/decline from non-owners", async () => {
    const listId = "list-forbid-review";
    const todoId = "todo-forbid-review";
    await seedCollaborativeList(listId);
    await seedTodo(todoId, listId);

    const requested = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "task",
      targetId: todoId,
    });
    expect(requested.kind).toBe("requested");
    if (requested.kind !== "requested") return;

    const approve = await approvePendingDelete(db, requested.requestId, collaboratorId);
    expect(approve.kind).toBe("forbidden");

    const decline = await declinePendingDelete(db, requested.requestId, collaboratorId);
    expect(decline.kind).toBe("forbidden");

    expect(await listPendingDeletesForList(db, listId)).toHaveLength(1);
  });

  it("queues clear-completed and list deletes for collaborators", async () => {
    const listId = "list-bulk";
    await seedCollaborativeList(listId);
    await seedTodo("todo-done", listId);
    await db.prepare("UPDATE todos SET completed = 1 WHERE id = ?").bind("todo-done").run();

    const clear = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "clear_completed",
    });
    expect(clear.kind).toBe("requested");

    const listDelete = await requestOrPerformDelete(db, {
      listId,
      userId: collaboratorId,
      isOwner: false,
      canEdit: true,
      targetType: "list",
    });
    expect(listDelete.kind).toBe("requested");

    const pending = await listPendingDeletesForList(db, listId);
    expect(pending.map((p) => p.targetType).sort()).toEqual(["clear_completed", "list"]);

    const stillThere = await db.prepare("SELECT id FROM lists WHERE id = ?").bind(listId).first();
    expect(stillThere).not.toBeNull();
  });
});
