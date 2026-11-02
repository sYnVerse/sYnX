import {
  describeDeleteTarget,
  isOwnTaskTree,
  type DeleteTargetType,
  type PendingDeleteRequest,
  type TaskCreatorInfo,
} from "../shared";
import { TodoManager } from "./to-do-manager";
import { sendFCMPushNotification } from "./fcm.server";

export type { DeleteTargetType, PendingDeleteRequest };
export { describeDeleteTarget };

export const DELETE_REQUEST_MESSAGE =
  "Delete request sent. The list owner must approve it.";

export const DELETE_REQUEST_ALREADY_MESSAGE =
  "A delete request for this is already waiting for the list owner.";

export const CLEAR_COMPLETED_PARTIAL_MESSAGE =
  "Your completed tasks were cleared. A delete request was sent for completed tasks others added; the list owner must approve it.";

export const CLEAR_COMPLETED_PARTIAL_ALREADY_MESSAGE =
  "Your completed tasks were cleared. A delete request for completed tasks others added is already waiting for the list owner.";

/** id, parent and creator for every task on a list (for own-task checks). */
export async function loadTaskCreators(
  db: D1Database,
  listId: string
): Promise<Array<TaskCreatorInfo & { completed: boolean }>> {
  const { results } = await db
    .prepare("SELECT id, parent_id, created_by, completed FROM todos WHERE list_id = ?")
    .bind(listId)
    .all<{ id: string; parent_id: string | null; created_by: string | null; completed: number | boolean }>();
  return (results || []).map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    createdBy: r.created_by,
    completed: Boolean(r.completed),
  }));
}

type PendingRow = {
  id: string;
  list_id: string;
  list_name: string;
  requester_id: string;
  target_type: DeleteTargetType;
  target_id: string;
  target_label: string | null;
  created_at: number;
};

function mapRow(row: PendingRow): PendingDeleteRequest {
  return {
    id: row.id,
    listId: row.list_id,
    listName: row.list_name,
    requesterId: row.requester_id,
    targetType: row.target_type,
    targetId: row.target_id || "",
    targetLabel: row.target_label,
    createdAt: Number(row.created_at),
  };
}

function normalizeTargetId(targetType: DeleteTargetType, targetId?: string | null): string {
  if (targetType === "task") return targetId || "";
  return "";
}

/**
 * Owner deletes immediately. On a public_edit list a collaborator deletes a
 * task right away when they added it and every subtask under it; any other
 * task, the rest of Clear Completed, and the whole list become a pending
 * request the owner must approve. Tasks with no recorded creator count as
 * added by someone else. Everyone else is forbidden.
 */
export async function requestOrPerformDelete(
  db: D1Database,
  options: {
    listId: string;
    userId: string;
    isOwner: boolean;
    canEdit: boolean;
    targetType: DeleteTargetType;
    targetId?: string | null;
    env?: unknown;
    waitUntil?: (promise: Promise<unknown>) => void;
  }
): Promise<
  | { kind: "deleted" }
  | {
      kind: "requested";
      requestId: string;
      alreadyExisted: boolean;
      message: string;
      /** Clear Completed only: how many of the caller's own completed tasks were deleted right away. */
      deletedOwnCount?: number;
    }
  | { kind: "forbidden"; error: string }
  | { kind: "not_found"; error: string }
  | { kind: "bad_request"; error: string }
> {
  const { listId, userId, isOwner, canEdit, targetType, env, waitUntil } = options;
  const targetId = normalizeTargetId(targetType, options.targetId);

  if (targetType === "task" && !targetId) {
    return { kind: "bad_request", error: "Task ID is required" };
  }

  if (isOwner) {
    await performDelete(db, listId, targetType, targetId);
    return { kind: "deleted" };
  }

  if (!canEdit) {
    return { kind: "forbidden", error: "Edit permission denied for list" };
  }

  if (targetType === "task") {
    const todo = await db
      .prepare("SELECT id, text FROM todos WHERE id = ? AND list_id = ?")
      .bind(targetId, listId)
      .first<{ id: string; text: string }>();
    if (!todo) {
      return { kind: "not_found", error: "Todo not found" };
    }
    const tasks = await loadTaskCreators(db, listId);
    if (isOwnTaskTree(tasks, targetId, userId)) {
      await performDelete(db, listId, "task", targetId);
      return { kind: "deleted" };
    }
  }

  let deletedOwnCount: number | undefined;
  if (targetType === "clear_completed") {
    const tasks = await loadTaskCreators(db, listId);
    const completed = tasks.filter((t) => t.completed);
    const ownIds = completed
      .filter((t) => isOwnTaskTree(tasks, t.id, userId))
      .map((t) => t.id);
    if (ownIds.length > 0) {
      await deleteTasksById(db, listId, ownIds);
    }
    if (ownIds.length === completed.length) {
      // Nothing added by others is left to clear, so any earlier request is moot.
      await db
        .prepare(
          `DELETE FROM pending_delete_requests
           WHERE list_id = ? AND target_type = 'clear_completed'`
        )
        .bind(listId)
        .run();
      return { kind: "deleted" };
    }
    deletedOwnCount = ownIds.length;
  }
  const partialClear = deletedOwnCount !== undefined && deletedOwnCount > 0;

  const existing = await db
    .prepare(
      `SELECT id FROM pending_delete_requests
       WHERE list_id = ? AND target_type = ? AND target_id = ?`
    )
    .bind(listId, targetType, targetId)
    .first<{ id: string }>();

  if (existing) {
    return {
      kind: "requested",
      requestId: existing.id,
      alreadyExisted: true,
      message: partialClear ? CLEAR_COMPLETED_PARTIAL_ALREADY_MESSAGE : DELETE_REQUEST_ALREADY_MESSAGE,
      ...(deletedOwnCount !== undefined ? { deletedOwnCount } : {}),
    };
  }

  const requestId = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    await db
      .prepare(
        `INSERT INTO pending_delete_requests
           (id, list_id, requester_id, target_type, target_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(requestId, listId, userId, targetType, targetId, createdAt)
      .run();
  } catch (e: unknown) {
    // Race: another request landed first — treat as already pending.
    const raced = await db
      .prepare(
        `SELECT id FROM pending_delete_requests
         WHERE list_id = ? AND target_type = ? AND target_id = ?`
      )
      .bind(listId, targetType, targetId)
      .first<{ id: string }>();
    if (raced) {
      return {
        kind: "requested",
        requestId: raced.id,
        alreadyExisted: true,
        message: partialClear ? CLEAR_COMPLETED_PARTIAL_ALREADY_MESSAGE : DELETE_REQUEST_ALREADY_MESSAGE,
        ...(deletedOwnCount !== undefined ? { deletedOwnCount } : {}),
      };
    }
    throw e;
  }

  const notifyPromise = notifyOwnerOfDeleteRequest(db, env, listId, targetType, targetId);
  if (waitUntil) {
    waitUntil(notifyPromise.catch((err) => console.error("[pending-deletes] notify failed:", err)));
  } else {
    await notifyPromise.catch((err) => console.error("[pending-deletes] notify failed:", err));
  }

  return {
    kind: "requested",
    requestId,
    alreadyExisted: false,
    message: partialClear ? CLEAR_COMPLETED_PARTIAL_MESSAGE : DELETE_REQUEST_MESSAGE,
    ...(deletedOwnCount !== undefined ? { deletedOwnCount } : {}),
  };
}

/** Delete specific tasks (and, by cascade, their subtasks) and any task delete requests for them. */
async function deleteTasksById(db: D1Database, listId: string, ids: string[]): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const id of ids) {
    statements.push(
      db.prepare("DELETE FROM todos WHERE id = ? AND list_id = ?").bind(id, listId)
    );
  }
  statements.push(
    db
      .prepare(
        `DELETE FROM pending_delete_requests
         WHERE list_id = ?
           AND target_type = 'task'
           AND target_id NOT IN (SELECT id FROM todos WHERE list_id = ?)`
      )
      .bind(listId, listId)
  );
  await db.batch(statements);
}

async function performDelete(
  db: D1Database,
  listId: string,
  targetType: DeleteTargetType,
  targetId: string
): Promise<void> {
  const manager = new TodoManager(db, listId);
  if (targetType === "task") {
    await manager.delete(targetId);
    await db
      .prepare(
        `DELETE FROM pending_delete_requests
         WHERE list_id = ? AND target_type = 'task' AND target_id = ?`
      )
      .bind(listId, targetId)
      .run();
    return;
  }
  if (targetType === "clear_completed") {
    await manager.clearCompleted();
    await db
      .prepare(
        `DELETE FROM pending_delete_requests
         WHERE list_id = ? AND target_type = 'clear_completed'`
      )
      .bind(listId)
      .run();
    // Drop task delete requests whose todos were removed with clear-completed.
    await db
      .prepare(
        `DELETE FROM pending_delete_requests
         WHERE list_id = ?
           AND target_type = 'task'
           AND target_id NOT IN (SELECT id FROM todos WHERE list_id = ?)`
      )
      .bind(listId, listId)
      .run();
    return;
  }
  // list — cascades to todos and pending_delete_requests
  await db.prepare("DELETE FROM lists WHERE id = ?").bind(listId).run();
}

async function notifyOwnerOfDeleteRequest(
  db: D1Database,
  env: unknown,
  listId: string,
  targetType: DeleteTargetType,
  targetId: string
): Promise<void> {
  if (!env) return;

  const list = await db
    .prepare("SELECT name, owner_id FROM lists WHERE id = ?")
    .bind(listId)
    .first<{ name: string; owner_id: string }>();
  if (!list) return;

  let targetLabel: string | null = null;
  if (targetType === "task" && targetId) {
    const todo = await db
      .prepare("SELECT text FROM todos WHERE id = ?")
      .bind(targetId)
      .first<{ text: string }>();
    targetLabel = todo?.text ?? null;
  }

  const summary = describeDeleteTarget(targetType, targetLabel);
  const { results } = await db
    .prepare("SELECT token FROM device_tokens WHERE user_id = ?")
    .bind(list.owner_id)
    .all<{ token: string }>();
  const tokens = results || [];
  if (tokens.length === 0) return;

  await Promise.all(
    tokens.map((device) =>
      sendFCMPushNotification(
        device.token,
        {
          title: "Delete request",
          body: `Someone asked to delete ${summary} on "${list.name}"`,
          data: { listId, type: "delete_request" },
        },
        env
      )
    )
  );
}

const SELECT_WITH_LABEL = `
  SELECT
    p.id,
    p.list_id,
    l.name AS list_name,
    p.requester_id,
    p.target_type,
    p.target_id,
    t.text AS target_label,
    p.created_at
  FROM pending_delete_requests p
  JOIN lists l ON l.id = p.list_id
  LEFT JOIN todos t ON t.id = p.target_id AND p.target_type = 'task'
`;

export async function listPendingDeletesForList(
  db: D1Database,
  listId: string
): Promise<PendingDeleteRequest[]> {
  const { results } = await db
    .prepare(`${SELECT_WITH_LABEL} WHERE p.list_id = ? ORDER BY p.created_at ASC`)
    .bind(listId)
    .all<PendingRow>();
  return (results || []).map(mapRow);
}

export async function listPendingDeletesForOwner(
  db: D1Database,
  ownerId: string
): Promise<PendingDeleteRequest[]> {
  const { results } = await db
    .prepare(
      `${SELECT_WITH_LABEL}
       WHERE l.owner_id = ?
       ORDER BY p.created_at ASC`
    )
    .bind(ownerId)
    .all<PendingRow>();
  return (results || []).map(mapRow);
}

export async function getPendingDeleteById(
  db: D1Database,
  requestId: string
): Promise<(PendingDeleteRequest & { ownerId: string }) | null> {
  const row = await db
    .prepare(
      `SELECT
         p.id,
         p.list_id,
         l.name AS list_name,
         p.requester_id,
         p.target_type,
         p.target_id,
         t.text AS target_label,
         p.created_at,
         l.owner_id
       FROM pending_delete_requests p
       JOIN lists l ON l.id = p.list_id
       LEFT JOIN todos t ON t.id = p.target_id AND p.target_type = 'task'
       WHERE p.id = ?`
    )
    .bind(requestId)
    .first<PendingRow & { owner_id: string }>();
  if (!row) return null;
  return { ...mapRow(row), ownerId: row.owner_id };
}

export async function approvePendingDelete(
  db: D1Database,
  requestId: string,
  ownerId: string
): Promise<
  | { kind: "approved"; listId: string; targetType: DeleteTargetType }
  | { kind: "forbidden"; error: string }
  | { kind: "not_found"; error: string }
> {
  const row = await db
    .prepare(
      `SELECT p.id, p.list_id, p.target_type, p.target_id, l.owner_id
       FROM pending_delete_requests p
       JOIN lists l ON l.id = p.list_id
       WHERE p.id = ?`
    )
    .bind(requestId)
    .first<{
      id: string;
      list_id: string;
      target_type: DeleteTargetType;
      target_id: string;
      owner_id: string;
    }>();

  if (!row) {
    return { kind: "not_found", error: "Delete request not found" };
  }
  if (row.owner_id !== ownerId) {
    return { kind: "forbidden", error: "Only the list owner can approve delete requests" };
  }

  // Remove the request first so a failed mid-delete doesn't leave a stale row
  // when the target is already gone (e.g. task deleted another way).
  await db.prepare("DELETE FROM pending_delete_requests WHERE id = ?").bind(requestId).run();

  try {
    await performDelete(db, row.list_id, row.target_type, row.target_id || "");
  } catch (e) {
    // Target may already be gone; request is cleared either way.
    console.error("[pending-deletes] approve performDelete:", e);
  }

  return { kind: "approved", listId: row.list_id, targetType: row.target_type };
}

export async function declinePendingDelete(
  db: D1Database,
  requestId: string,
  ownerId: string
): Promise<
  | { kind: "declined"; listId: string }
  | { kind: "forbidden"; error: string }
  | { kind: "not_found"; error: string }
> {
  const row = await db
    .prepare(
      `SELECT p.id, p.list_id, l.owner_id
       FROM pending_delete_requests p
       JOIN lists l ON l.id = p.list_id
       WHERE p.id = ?`
    )
    .bind(requestId)
    .first<{ id: string; list_id: string; owner_id: string }>();

  if (!row) {
    return { kind: "not_found", error: "Delete request not found" };
  }
  if (row.owner_id !== ownerId) {
    return { kind: "forbidden", error: "Only the list owner can decline delete requests" };
  }

  await db.prepare("DELETE FROM pending_delete_requests WHERE id = ?").bind(requestId).run();
  return { kind: "declined", listId: row.list_id };
}

/** Task ids on a list that already have a pending delete request. */
export async function pendingTaskDeleteIds(
  db: D1Database,
  listId: string
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT target_id FROM pending_delete_requests
       WHERE list_id = ? AND target_type = 'task' AND target_id != ''`
    )
    .bind(listId)
    .all<{ target_id: string }>();
  return new Set((results || []).map((r) => r.target_id));
}
