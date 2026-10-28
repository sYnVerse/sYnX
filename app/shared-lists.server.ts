/**
 * Record that a signed-in non-owner opened an accessible shared list.
 * No-op for owners or when userId is empty.
 */
export async function recordSharedListAccess(
  db: D1Database,
  userId: string,
  listId: string,
  isOwner: boolean
): Promise<void> {
  if (!userId || isOwner) return;
  const openedAt = Date.now();
  try {
    await db
      .prepare(
        `INSERT INTO shared_list_access (user_id, list_id, opened_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, list_id) DO UPDATE SET opened_at = excluded.opened_at`
      )
      .bind(userId, listId, openedAt)
      .run();
  } catch (e) {
    console.error("Failed to record shared list access:", e);
  }
}

/** Remove a list from the caller's "Shared with me" view. */
export async function removeSharedListAccess(
  db: D1Database,
  userId: string,
  listId: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM shared_list_access WHERE user_id = ? AND list_id = ?")
    .bind(userId, listId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Lists the user previously opened that they don't own and that are still shareable.
 * Private lists are excluded so they drop out for non-owners.
 */
export async function listSharedWithMe(
  db: D1Database,
  userId: string
): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT l.*
       FROM shared_list_access s
       INNER JOIN lists l ON l.id = s.list_id
       WHERE s.user_id = ?
         AND l.owner_id != ?
         AND l.share_mode IN ('public_read', 'public_edit')
       ORDER BY s.opened_at DESC`
    )
    .bind(userId, userId)
    .all<any>();
  return results || [];
}
