export type ListAccessDenial = "not_found" | "private";

export async function getListAccess(db: D1Database, listId: string, userId: string) {
  const listRow = await db.prepare("SELECT * FROM lists WHERE id = ?").bind(listId).first<any>();
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
