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

async function seedTodo(
  todoId: string,
  listId: string,
  text = "Task",
  options: { createdBy?: string | null; parentId?: string | null; completed?: boolean } = {}
) {
  await env.DB.prepare(
    "INSERT INTO todos (id, list_id, text, completed, created_at, created_by, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      todoId,
      listId,
      text,
      options.completed ? 1 : 0,
      Date.now(),
      options.createdBy ?? null,
      options.parentId ?? null
    )
    .run();
}

async function todoExists(todoId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM todos WHERE id = ?").bind(todoId).first();
  return row !== null;
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

  describe("collaborator deleting tasks they added", () => {
    const collabDelete = (listId: string, todoId: string) =>
      requestOrPerformDelete(db, {
        listId,
        userId: collaboratorId,
        isOwner: false,
        canEdit: true,
        targetType: "task",
        targetId: todoId,
      });

    it("deletes the collaborator's own task right away", async () => {
      const listId = "list-own-task";
      await seedCollaborativeList(listId);
      await seedTodo("todo-own", listId, "Mine", { createdBy: collaboratorId });

      const result = await collabDelete(listId, "todo-own");

      expect(result.kind).toBe("deleted");
      expect(await todoExists("todo-own")).toBe(false);
      expect(await listPendingDeletesForList(db, listId)).toHaveLength(0);
    });

    it("still sends a request for a task someone else added", async () => {
      const listId = "list-others-task";
      await seedCollaborativeList(listId);
      await seedTodo("todo-others", listId, "Theirs", { createdBy: ownerId });

      const result = await collabDelete(listId, "todo-others");

      expect(result.kind).toBe("requested");
      expect(await todoExists("todo-others")).toBe(true);
      expect(await listPendingDeletesForList(db, listId)).toHaveLength(1);
    });

    it("sends a request for a task with no recorded creator", async () => {
      const listId = "list-null-creator";
      await seedCollaborativeList(listId);
      await seedTodo("todo-null", listId, "Old task", { createdBy: null });

      const result = await collabDelete(listId, "todo-null");

      expect(result.kind).toBe("requested");
      expect(await todoExists("todo-null")).toBe(true);
    });

    it("sends a request when their own task has a subtask someone else added", async () => {
      const listId = "list-mixed-subtasks";
      await seedCollaborativeList(listId);
      await seedTodo("todo-parent", listId, "Parent", { createdBy: collaboratorId });
      await seedTodo("todo-child", listId, "Child", {
        createdBy: ownerId,
        parentId: "todo-parent",
      });

      const result = await collabDelete(listId, "todo-parent");

      expect(result.kind).toBe("requested");
      expect(await todoExists("todo-parent")).toBe(true);
      expect(await todoExists("todo-child")).toBe(true);
    });

    it("deletes their own task together with their own subtasks", async () => {
      const listId = "list-own-subtasks";
      await seedCollaborativeList(listId);
      await seedTodo("todo-own-parent", listId, "Parent", { createdBy: collaboratorId });
      await seedTodo("todo-own-child", listId, "Child", {
        createdBy: collaboratorId,
        parentId: "todo-own-parent",
      });

      const result = await collabDelete(listId, "todo-own-parent");

      expect(result.kind).toBe("deleted");
      expect(await todoExists("todo-own-parent")).toBe(false);
      expect(await todoExists("todo-own-child")).toBe(false);
    });

    it("does not let a different collaborator delete someone's task directly", async () => {
      const listId = "list-other-collab";
      await seedCollaborativeList(listId);
      await seedTodo("todo-collab2", listId, "Other collaborator", {
        createdBy: "user-collab-two",
      });

      const result = await collabDelete(listId, "todo-collab2");

      expect(result.kind).toBe("requested");
      expect(await todoExists("todo-collab2")).toBe(true);
    });

    it("clears their own completed tasks and sends one request for the rest", async () => {
      const listId = "list-mixed-clear";
      await seedCollaborativeList(listId);
      await seedTodo("todo-done-mine", listId, "Mine done", {
        createdBy: collaboratorId,
        completed: true,
      });
      await seedTodo("todo-done-theirs", listId, "Theirs done", {
        createdBy: ownerId,
        completed: true,
      });
      await seedTodo("todo-done-legacy", listId, "Legacy done", { completed: true });
      await seedTodo("todo-open-theirs", listId, "Still open", { createdBy: ownerId });

      const result = await requestOrPerformDelete(db, {
        listId,
        userId: collaboratorId,
        isOwner: false,
        canEdit: true,
        targetType: "clear_completed",
      });

      expect(result.kind).toBe("requested");
      if (result.kind !== "requested") return;
      expect(result.deletedOwnCount).toBe(1);
      expect(await todoExists("todo-done-mine")).toBe(false);
      expect(await todoExists("todo-done-theirs")).toBe(true);
      expect(await todoExists("todo-done-legacy")).toBe(true);
      expect(await todoExists("todo-open-theirs")).toBe(true);

      const pending = await listPendingDeletesForList(db, listId);
      expect(pending).toHaveLength(1);
      expect(pending[0].targetType).toBe("clear_completed");
    });

    it("clears right away when every completed task is their own", async () => {
      const listId = "list-own-clear";
      await seedCollaborativeList(listId);
      await seedTodo("todo-own-done", listId, "Mine done", {
        createdBy: collaboratorId,
        completed: true,
      });
      await seedTodo("todo-theirs-open", listId, "Theirs open", { createdBy: ownerId });

      const result = await requestOrPerformDelete(db, {
        listId,
        userId: collaboratorId,
        isOwner: false,
        canEdit: true,
        targetType: "clear_completed",
      });

      expect(result.kind).toBe("deleted");
      expect(await todoExists("todo-own-done")).toBe(false);
      expect(await todoExists("todo-theirs-open")).toBe(true);
      expect(await listPendingDeletesForList(db, listId)).toHaveLength(0);
    });

    it("still needs approval to delete the whole list", async () => {
      const listId = "list-own-only";
      await seedCollaborativeList(listId);
      await seedTodo("todo-only-mine", listId, "Mine", { createdBy: collaboratorId });

      const result = await requestOrPerformDelete(db, {
        listId,
        userId: collaboratorId,
        isOwner: false,
        canEdit: true,
        targetType: "list",
      });

      expect(result.kind).toBe("requested");
      const list = await db.prepare("SELECT id FROM lists WHERE id = ?").bind(listId).first();
      expect(list).not.toBeNull();
    });
  });
});
