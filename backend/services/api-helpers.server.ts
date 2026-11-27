import { getDisplayNamesForUsers, ownerPayload } from "./user-profile.server";
import { getArchivedListMap, isListArchivedForUser } from "./list-archives.server";

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

export interface ListTaskSummary {
  openTopLevelCount: number;
  totalCount: number;
  openTotalCount: number;
}

export type SerializeListOptions = {
  viewerUserId: string;
  /** Pre-resolved owner display names keyed by owner_id */
  ownerNames?: Map<string, string>;
  /** Pre-resolved open task counts keyed by list_id */
  openTaskCounts?: Map<string, number>;
  /** Pre-resolved task completion summaries keyed by list_id */
  taskSummaries?: Map<string, ListTaskSummary>;
  /** Pre-resolved archive timestamps for viewerUserId keyed by list_id */
  archivedAtByListId?: Map<string, number>;
  /** Override canEdit (defaults from share mode + ownership) */
  canEdit?: boolean;
};

/**
 * Batched query for total, open total (tasks + subtasks), and open top-level
 * task counts across a set of lists.
 */
export async function getTaskCompletionSummaryForLists(
  db: D1Database,
  listIds: string[],
): Promise<Map<string, ListTaskSummary>> {
  const summaries = new Map<string, ListTaskSummary>();
  const uniqueIds = Array.from(new Set(listIds)).filter(Boolean);
  if (uniqueIds.length === 0) return summaries;

  for (const id of uniqueIds) {
    summaries.set(id, {
      openTopLevelCount: 0,
      totalCount: 0,
      openTotalCount: 0,
    });
  }

  const chunkSize = 50;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT list_id,
                COUNT(*) AS total_count,
                SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS open_total_count,
                SUM(CASE WHEN parent_id IS NULL AND completed = 0 THEN 1 ELSE 0 END) AS open_top_level_count
         FROM todos
         WHERE list_id IN (${placeholders})
         GROUP BY list_id`,
      )
      .bind(...chunk)
      .all<{
        list_id: string;
        total_count: number;
        open_total_count: number;
        open_top_level_count: number;
      }>();

    for (const r of results || []) {
      summaries.set(r.list_id, {
        totalCount: Number(r.total_count) || 0,
        openTotalCount: Number(r.open_total_count) || 0,
        openTopLevelCount: Number(r.open_top_level_count) || 0,
      });
    }
  }

  return summaries;
}

/**
 * Batched query for open top-level task counts across a set of lists.
 */
export async function getOpenTaskCountsForLists(
  db: D1Database,
  listIds: string[]
): Promise<Map<string, number>> {
  const summaries = await getTaskCompletionSummaryForLists(db, listIds);
  const counts = new Map<string, number>();
  for (const [id, summary] of summaries.entries()) {
    counts.set(id, summary.openTopLevelCount);
  }
  return counts;
}

/** Map a D1 lists row to the public API list shape (includes additive `owner` and archive state). */
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
  let totalTaskCount: number;
  let openTotalCount: number;
  if (options.taskSummaries) {
    const summary = options.taskSummaries.get(row.id);
    openTaskCount = summary?.openTopLevelCount ?? 0;
    totalTaskCount = summary?.totalCount ?? 0;
    openTotalCount = summary?.openTotalCount ?? 0;
  } else if (options.openTaskCounts) {
    openTaskCount = options.openTaskCounts.get(row.id) ?? 0;
    totalTaskCount = openTaskCount;
    openTotalCount = openTaskCount;
  } else {
    try {
      const rowSummary = await db
        .prepare(
          `SELECT COUNT(*) AS total_count,
                  SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS open_total_count,
                  SUM(CASE WHEN parent_id IS NULL AND completed = 0 THEN 1 ELSE 0 END) AS open_top_level_count
           FROM todos
           WHERE list_id = ?`,
        )
        .bind(row.id)
        .first<{
          total_count: number;
          open_total_count: number | null;
          open_top_level_count: number | null;
        }>();
      totalTaskCount = Number(rowSummary?.total_count) || 0;
      openTotalCount = Number(rowSummary?.open_total_count) || 0;
      openTaskCount = Number(rowSummary?.open_top_level_count) || 0;
    } catch {
      totalTaskCount = 0;
      openTotalCount = 0;
      openTaskCount = 0;
    }
  }

  let archivedAt: number | null = null;
  if (options.archivedAtByListId) {
    archivedAt = options.archivedAtByListId.get(row.id) ?? null;
  } else if (viewerUserId) {
    try {
      archivedAt = await isListArchivedForUser(db, viewerUserId, row.id);
    } catch {
      archivedAt = null;
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
    totalTaskCount,
    allTasksCompleted: totalTaskCount > 0 && openTotalCount === 0,
    archivedAt,
    isArchived: archivedAt !== null,
  };
}

export async function serializeListRows(
  db: D1Database,
  rows: ListRow[],
  viewerUserId: string,
  archivedAtByListId?: Map<string, number>,
): Promise<Record<string, unknown>[]> {
  const ownerIds = rows.map((r) => r.owner_id);
  const listIds = rows.map((r) => r.id);
  const [ownerNames, taskSummaries, archivedMap] = await Promise.all([
    getDisplayNamesForUsers(db, ownerIds),
    getTaskCompletionSummaryForLists(db, listIds),
    archivedAtByListId !== undefined
      ? Promise.resolve(archivedAtByListId)
      : viewerUserId
        ? getArchivedListMap(db, viewerUserId, listIds)
        : Promise.resolve(new Map<string, number>()),
  ]);
  return Promise.all(
    rows.map((row) =>
      serializeListRow(db, row, {
        viewerUserId,
        ownerNames,
        taskSummaries,
        archivedAtByListId: archivedMap,
      }),
    ),
  );
}
