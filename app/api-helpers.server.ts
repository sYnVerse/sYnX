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
  /** Override canEdit (defaults from share mode + ownership) */
  canEdit?: boolean;
};

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

  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
    expirationTtl: row.expiration_ttl != null ? Number(row.expiration_ttl) : null,
    shareMode,
    category: row.category || "Checklist",
    isOwner,
    canEdit,
    owner: ownerPayload(displayName),
  };
}

export async function serializeListRows(
  db: D1Database,
  rows: ListRow[],
  viewerUserId: string
): Promise<Record<string, unknown>[]> {
  const ownerIds = rows.map((r) => r.owner_id);
  const ownerNames = await getDisplayNamesForUsers(db, ownerIds);
  return Promise.all(
    rows.map((row) => serializeListRow(db, row, { viewerUserId, ownerNames }))
  );
}
