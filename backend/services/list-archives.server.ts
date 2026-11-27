import { logListActivity } from "./list-activity.server";

export async function getArchivedListMap(
  db: D1Database,
  userId: string,
  listIds?: readonly string[],
): Promise<Map<string, number>> {
  const archived = new Map<string, number>();
  if (!userId) return archived;

  if (listIds !== undefined) {
    const uniqueIds = Array.from(new Set(listIds)).filter(Boolean);
    if (uniqueIds.length === 0) return archived;

    const chunkSize = 50;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const { results } = await db
        .prepare(
          `SELECT list_id, archived_at
           FROM list_archives
           WHERE user_id = ? AND list_id IN (${placeholders})`,
        )
        .bind(userId, ...chunk)
        .all<{ list_id: string; archived_at: number }>();

      for (const row of results || []) {
        archived.set(row.list_id, Number(row.archived_at));
      }
    }
    return archived;
  }

  const { results } = await db
    .prepare("SELECT list_id, archived_at FROM list_archives WHERE user_id = ?")
    .bind(userId)
    .all<{ list_id: string; archived_at: number }>();
  for (const row of results || []) {
    archived.set(row.list_id, Number(row.archived_at));
  }
  return archived;
}

export async function isListArchivedForUser(
  db: D1Database,
  userId: string,
  listId: string,
): Promise<number | null> {
  if (!userId || !listId) return null;
  const row = await db
    .prepare("SELECT archived_at FROM list_archives WHERE user_id = ? AND list_id = ?")
    .bind(userId, listId)
    .first<{ archived_at: number }>();
  return row ? Number(row.archived_at) : null;
}

export async function archiveListForUser(
  db: D1Database,
  userId: string,
  listId: string,
  now: number = Date.now(),
): Promise<{ archivedAt: number; alreadyArchived: boolean }> {
  const existing = await isListArchivedForUser(db, userId, listId);
  if (existing !== null) {
    return { archivedAt: existing, alreadyArchived: true };
  }
  await db
    .prepare(
      `INSERT INTO list_archives (user_id, list_id, archived_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, list_id) DO NOTHING`,
    )
    .bind(userId, listId, now)
    .run();
  const stored = await isListArchivedForUser(db, userId, listId);
  return { archivedAt: stored ?? now, alreadyArchived: false };
}

export async function unarchiveListForUser(
  db: D1Database,
  userId: string,
  listId: string,
): Promise<boolean> {
  if (!userId || !listId) return false;
  const result = await db
    .prepare("DELETE FROM list_archives WHERE user_id = ? AND list_id = ?")
    .bind(userId, listId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function unarchiveListIfArchivedOnTaskAdd(
  db: D1Database,
  input: {
    userId: string;
    listId: string;
    isOwner: boolean;
    shareMode?: string | null;
    request?: Request | null;
    waitUntil?: ((p: Promise<unknown>) => void) | undefined;
  },
): Promise<boolean> {
  if (!input.userId || !input.listId) return false;
  const removed = await unarchiveListForUser(db, input.userId, input.listId);
  if (!removed) return false;

  const logPromise = logListActivity(db, {
    listId: input.listId,
    action: "list_unarchived",
    actorId: input.userId,
    isOwner: input.isOwner,
    shareMode: input.shareMode,
    request: input.request,
    summary: "Unarchived when a task was added",
  });
  if (input.waitUntil) input.waitUntil(logPromise);
  else await logPromise;
  return true;
}

export async function findFirstActiveOwnedListId(
  db: D1Database,
  userId: string,
  excludeListId?: string | null,
): Promise<string | null> {
  if (!userId) return null;
  if (excludeListId) {
    const row = await db
      .prepare(
        `SELECT l.id
         FROM lists l
         LEFT JOIN list_archives a ON a.list_id = l.id AND a.user_id = ?
         WHERE l.owner_id = ? AND l.id != ? AND a.list_id IS NULL
         ORDER BY l.created_at ASC
         LIMIT 1`,
      )
      .bind(userId, userId, excludeListId)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  const row = await db
    .prepare(
      `SELECT l.id
       FROM lists l
       LEFT JOIN list_archives a ON a.list_id = l.id AND a.user_id = ?
       WHERE l.owner_id = ? AND a.list_id IS NULL
       ORDER BY l.created_at ASC
       LIMIT 1`,
    )
    .bind(userId, userId)
    .first<{ id: string }>();
  return row?.id ?? null;
}
