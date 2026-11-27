import type { ApiRouteArgs } from "../types";
import { getCloudflareContext } from "../../services/context.server";
import { getRequestApiAuth } from "../../services/auth-context.server";
import * as v from "valibot";
import { CreateListSchema } from "@synx/shared";
import { parseListScope, serializeListRows, type ListRow } from "../../services/api-helpers.server";
import { getArchivedListMap } from "../../services/list-archives.server";
import { listSharedWithMe } from "../../services/shared-lists.server";
import { ownerPayload, resolveDisplayName } from "../../services/user-profile.server";
import { categoryError, listNameError, normalizeOptionalCategory } from "@synx/shared/write-limits";

type ArchivedFilter = "exclude" | "only" | "all";

function parseArchivedFilter(raw: string | null): ArchivedFilter {
  if (raw === "true" || raw === "only") return "only";
  if (raw === "all") return "all";
  return "exclude";
}

export async function loader({  request, context  }: ApiRouteArgs) {
  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = parseListScope(url.searchParams.get("scope"));
  const archivedFilter = parseArchivedFilter(url.searchParams.get("archived"));

  let rows: ListRow[] = [];

  if (scope === "mine" || scope === "all") {
    const { results } = await db
      .prepare(
        `SELECT * FROM lists
         WHERE owner_id = ?
         ORDER BY created_at DESC`
      )
      .bind(user.userId)
      .all<ListRow>();
    rows = rows.concat(results || []);
  }

  if (scope === "shared" || scope === "all") {
    const shared = await listSharedWithMe(db, user.userId);
    // Avoid duplicates if somehow an owned list appears in shared access
    const ownedIds = new Set(rows.map((r) => r.id));
    for (const row of shared) {
      if (!ownedIds.has(row.id)) rows.push(row);
    }
  }

  const archivedAtByListId = await getArchivedListMap(
    db,
    user.userId,
    rows.map((r) => r.id),
  );
  if (archivedFilter === "exclude") {
    rows = rows.filter((r) => !archivedAtByListId.has(r.id));
  } else if (archivedFilter === "only") {
    rows = rows
      .filter((r) => archivedAtByListId.has(r.id))
      .sort(
        (a, b) =>
          (archivedAtByListId.get(b.id) ?? 0) - (archivedAtByListId.get(a.id) ?? 0),
      );
  }

  const lists = await serializeListRows(db, rows, user.userId, archivedAtByListId);
  return Response.json({ success: true, lists, scope, archived: archivedFilter });
}

export async function action({  request, context  }: ApiRouteArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = v.parse(CreateListSchema, body);
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const category = normalizeOptionalCategory(parsed.category);
    const limitError = listNameError(parsed.name) || categoryError(category);
    if (limitError) {
      return Response.json({ error: limitError }, { status: 400 });
    }

    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode, category) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(id, parsed.name, user.userId, createdAt, "private", category)
      .run();

    const displayName = resolveDisplayName(
      (
        await db
          .prepare("SELECT display_name FROM user_settings WHERE user_id = ?")
          .bind(user.userId)
          .first<{ display_name?: string | null }>()
      )?.display_name
    );

    const newList = {
      id,
      name: parsed.name,
      ownerId: user.userId,
      createdAt,
      expirationTtl: null,
      shareMode: "private",
      category,
      isOwner: true,
      canEdit: true,
      owner: ownerPayload(displayName),
      openTaskCount: 0,
      totalTaskCount: 0,
      allTasksCompleted: false,
      archivedAt: null,
      isArchived: false,
    };

    return Response.json({ success: true, list: newList }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return Response.json({ error: message || "Invalid list creation payload" }, { status: 400 });
  }
}
