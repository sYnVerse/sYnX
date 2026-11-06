import { getDisplayNamesForUsers, ownerPayload } from "./user-profile.server";

export type ListAccessDenial = "not_found" | "private";

export type ListScope = "mine" | "shared" | "all";

export interface ListRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: number;
  expiration_ttl: number | null;
  share_mode: string | null;
  category: string | null;
}

export function parseListScope(raw: string | null): ListScope {
  if (raw === "shared" || raw === "all") return raw;
  return "mine";
}

export async function getListAccess(db: D1Database, listId: string, userId: string) {
  const listRow = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<ListRow>();
  if (!listRow) {
    return {
      list: null,
      hasAccess: false,
      canEdit: false,
      isOwner: false,
      denial: "not_found" as ListAccessDenial,
    };
  }

  const isOwner = listRow.owner_id === userId;
  const shareMode = listRow.share_mode || "private";
  const canRead = isOwner || shareMode === "public_read" || shareMode === "public_edit";
  const canEdit = isOwner || shareMode === "public_edit";

  return {
    list: listRow,
    hasAccess: canRead,
    canEdit,
    isOwner,
    denial: canRead ? null : ("private" as ListAccessDenial),
  };
}

export type SerializeListOptions = {
  viewerUserId: string;
  /** Pre-resolved owner display names keyed by owner_id */
  ownerNames?: Map<string, string>;
  /** Pre-resolved open task counts keyed by list_id */
  openTaskCounts?: Map<string, number>;
  /** Override canEdit (defaults from share mode + ownership) */
  canEdit?: boolean;
};

/**
 * Batched query for open top-level task counts across a set of lists.
 */
export async function getOpenTaskCountsForLists(
  db: D1Database,
  listIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const uniqueIds = Array.from(new Set(listIds)).filter(Boolean);
  if (uniqueIds.length === 0) return counts;

  for (const id of uniqueIds) {
    counts.set(id, 0);
  }

  const chunkSize = 50;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT list_id, COUNT(*) AS open_count
         FROM todos
         WHERE list_id IN (${placeholders})
           AND parent_id IS NULL
           AND completed = 0
         GROUP BY list_id`
      )
      .bind(...chunk)
      .all<{ list_id: string; open_count: number }>();

    for (const r of results || []) {
      counts.set(r.list_id, Number(r.open_count) || 0);
    }
  }

  return counts;
}

/** Map a D1 lists row to the public API list shape (includes additive `owner`). */
export async function serializeListRow(
  db: D1Database,
  row: ListRow,
  options: SerializeListOptions
): Promise<Record<string, unknown>> {
  const viewerUserId = options.viewerUserId;
  const isOwner = row.owner_id === viewerUserId;
  const shareMode = row.share_mode || "private";
  const canEdit =
    options.canEdit !== undefined
      ? options.canEdit
      : isOwner || shareMode === "public_edit";

  let displayName: string | undefined;
  if (options.ownerNames?.has(row.owner_id)) {
    displayName = options.ownerNames.get(row.owner_id);
  } else {
    const names = await getDisplayNamesForUsers(db, [row.owner_id]);
    displayName = names.get(row.owner_id);
  }

  let openTaskCount: number;
  if (options.openTaskCounts) {
    openTaskCount = options.openTaskCounts.get(row.id) ?? 0;
  } else {
    try {
      const rowCount = await db
        .prepare(
          "SELECT COUNT(*) AS c FROM todos WHERE list_id = ? AND parent_id IS NULL AND completed = 0"
        )
        .bind(row.id)
        .first<{ c: number }>();
      openTaskCount = Number(rowCount?.c) || 0;
    } catch {
      openTaskCount = 0;
    }
  }

  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
    expirationTtl: row.expiration_ttl != null ? Number(row.expiration_ttl) : null,
    shareMode,
    category: row.category ?? null,
    isOwner,
    canEdit,
    owner: ownerPayload(displayName),
    openTaskCount,
  };
}

export async function serializeListRows(
  db: D1Database,
  rows: ListRow[],
  viewerUserId: string
): Promise<Record<string, unknown>[]> {
  const ownerIds = rows.map((r) => r.owner_id);
  const listIds = rows.map((r) => r.id);
  const [ownerNames, openTaskCounts] = await Promise.all([
    getDisplayNamesForUsers(db, ownerIds),
    getOpenTaskCountsForLists(db, listIds),
  ]);
  return Promise.all(
    rows.map((row) =>
      serializeListRow(db, row, { viewerUserId, ownerNames, openTaskCounts })
    )
  );
}
