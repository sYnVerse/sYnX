import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { verifyBearerToken } from "../auth.server";
import * as v from "valibot";
import { CreateListSchema } from "../../shared";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB as D1Database;
  const user = await verifyBearerToken(request, env);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { results } = await db
    .prepare(
      `SELECT * FROM lists 
       WHERE owner_id = ? OR share_mode IN ('public_read', 'public_edit') 
       ORDER BY created_at DESC`
    )
    .bind(user.userId)
    .all<any>();

  const lists = results.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
    expirationTtl: row.expiration_ttl ? Number(row.expiration_ttl) : null,
    shareMode: row.share_mode || "private",
    isOwner: row.owner_id === user.userId,
  }));

  return Response.json({ success: true, lists });
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

    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind(id, parsed.name, user.userId, createdAt, "private")
      .run();

    const newList = {
      id,
      name: parsed.name,
      ownerId: user.userId,
      createdAt,
      expirationTtl: null,
      shareMode: "private",
      isOwner: true,
    };

    return Response.json({ success: true, list: newList }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message || "Invalid list creation payload" }, { status: 400 });
  }
}
