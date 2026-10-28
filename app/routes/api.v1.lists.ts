import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { CreateListSchema } from "../../shared";
import { parseListScope, serializeListRows } from "../api-helpers.server";
import { listSharedWithMe } from "../shared-lists.server";
import { ownerPayload, resolveDisplayName } from "../user-profile.server";
import { categoryError, listNameError } from "../write-limits";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = parseListScope(url.searchParams.get("scope"));

  let rows: any[] = [];

  if (scope === "mine" || scope === "all") {
    const { results } = await db
      .prepare(
        `SELECT * FROM lists
         WHERE owner_id = ?
         ORDER BY created_at DESC`
      )
      .bind(user.userId)
      .all<any>();
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

  const lists = await serializeListRows(db, rows, user.userId);
  return Response.json({ success: true, lists, scope });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = v.parse(CreateListSchema, body);
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const category = parsed.category || "Checklist";
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
    };

    return Response.json({ success: true, list: newList }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message || "Invalid list creation payload" }, { status: 400 });
  }
}
