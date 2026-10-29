import {
  describeListActivityAction,
  type ListActivityAction,
  type ListActivityActorType,
  type ListActivityEntry,
} from "../shared";
import { isGuestId } from "./guest-access.server";
import { resolveDisplayName } from "./user-profile.server";

export const LIST_ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const LIST_ACTIVITY_DEFAULT_LIMIT = 50;
export const LIST_ACTIVITY_MAX_LIMIT = 100;

const SUMMARY_MAX = 240;
const USER_AGENT_MAX = 200;

export type LogListActivityInput = {
  listId: string;
  taskId?: string | null;
  action: ListActivityAction;
  actorId: string;
  isOwner: boolean;
  /** When known, skip a share_mode lookup. */
  shareMode?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  summary?: string | null;
  request?: Request | null;
};

export function clientMetaFromRequest(request: Request | null | undefined): {
  clientIp: string | null;
  userAgent: string | null;
} {
  if (!request) return { clientIp: null, userAgent: null };
  const ip = request.headers.get("CF-Connecting-IP");
  const ua = request.headers.get("User-Agent") || "";
  return {
    clientIp: ip && ip.trim() ? ip.trim() : null,
    userAgent: ua ? ua.slice(0, USER_AGENT_MAX) : null,
  };
}

export function resolveActorType(actorId: string, isOwner: boolean): ListActivityActorType {
  if (isOwner) return "owner";
  if (isGuestId(actorId)) return "guest";
  return "collaborator";
}

export function trimActivitySummary(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > SUMMARY_MAX ? `${trimmed.slice(0, SUMMARY_MAX - 1)}…` : trimmed;
}

export function guestActorShortId(actorId: string): string {
  // guest_<uuid> → first 8 of the uuid
  const rest = actorId.startsWith("guest_") ? actorId.slice("guest_".length) : actorId;
  return rest.slice(0, 8);
}

/**
 * Best-effort activity log for non-private lists. Never throws; never blocks
 * the caller's success path (callers may still await it after the mutation).
 */
export async function logListActivity(
  db: D1Database,
  input: LogListActivityInput
): Promise<void> {
  try {
    let shareMode = input.shareMode;
    if (shareMode == null) {
      const row = await db
        .prepare("SELECT share_mode FROM lists WHERE id = ?")
        .bind(input.listId)
        .first<{ share_mode: string | null }>();
      if (!row) return;
      shareMode = row.share_mode || "private";
    }
    if (!shareMode || shareMode === "private") return;

    const meta = input.request
      ? clientMetaFromRequest(input.request)
      : { clientIp: input.clientIp ?? null, userAgent: input.userAgent ?? null };

    await db
      .prepare(
        `INSERT INTO list_activity
           (id, list_id, task_id, action, actor_type, actor_id, client_ip, user_agent, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        input.listId,
        input.taskId || null,
        input.action,
        resolveActorType(input.actorId, input.isOwner),
        input.actorId,
        meta.clientIp,
        meta.userAgent,
        trimActivitySummary(input.summary),
        Date.now()
      )
      .run();
  } catch (e) {
    console.error("[list-activity] Failed to write activity log:", e);
  }
}

/** Delete activity rows older than 90 days. Returns how many rows were removed. */
export async function pruneOldListActivity(
  db: D1Database,
  now: number = Date.now()
): Promise<number> {
  const cutoff = now - LIST_ACTIVITY_RETENTION_MS;
  const result = await db
    .prepare("DELETE FROM list_activity WHERE created_at < ?")
    .bind(cutoff)
    .run();
  return result.meta?.changes ?? 0;
}

export async function listActivityForOwner(
  db: D1Database,
  listId: string,
  ownerId: string,
  options: { limit?: number; before?: number | null } = {}
): Promise<
  | { kind: "ok"; entries: ListActivityEntry[]; listName: string }
  | { kind: "forbidden"; error: string }
  | { kind: "not_found"; error: string }
> {
  const list = await db
    .prepare("SELECT id, name, owner_id, share_mode FROM lists WHERE id = ?")
    .bind(listId)
    .first<{ id: string; name: string; owner_id: string; share_mode: string | null }>();

  if (!list) {
    return { kind: "not_found", error: "List not found" };
  }
  if (list.owner_id !== ownerId) {
    return { kind: "forbidden", error: "Only the list owner can view activity" };
  }

  const limit = Math.min(
    Math.max(1, options.limit ?? LIST_ACTIVITY_DEFAULT_LIMIT),
    LIST_ACTIVITY_MAX_LIMIT
  );
  const before = options.before != null && Number.isFinite(options.before) ? Number(options.before) : null;

  const { results } =
    before != null
      ? await db
          .prepare(
            `SELECT id, list_id, task_id, action, actor_type, actor_id, client_ip, user_agent, summary, created_at
             FROM list_activity
             WHERE list_id = ? AND created_at < ?
             ORDER BY created_at DESC
             LIMIT ?`
          )
          .bind(listId, before, limit)
          .all<ActivityRow>()
      : await db
          .prepare(
            `SELECT id, list_id, task_id, action, actor_type, actor_id, client_ip, user_agent, summary, created_at
             FROM list_activity
             WHERE list_id = ?
             ORDER BY created_at DESC
             LIMIT ?`
          )
          .bind(listId, limit)
          .all<ActivityRow>();

  const rows = results || [];
  const signedInIds = [
    ...new Set(
      rows
        .filter((r) => r.actor_type !== "guest")
        .map((r) => r.actor_id)
    ),
  ];
  const labels = await resolveActorLabels(db, signedInIds);

  const entries: ListActivityEntry[] = rows.map((r) => ({
    id: r.id,
    listId: r.list_id,
    taskId: r.task_id,
    action: r.action as ListActivityAction,
    actorType: r.actor_type as ListActivityActorType,
    actorId: r.actor_id,
    actorLabel:
      r.actor_type === "guest"
        ? `Guest · ${guestActorShortId(r.actor_id)}`
        : labels.get(r.actor_id) || "sYnX user",
    clientIp: r.client_ip,
    userAgent: r.user_agent,
    summary: r.summary,
    createdAt: Number(r.created_at),
  }));

  return { kind: "ok", entries, listName: list.name };
}

type ActivityRow = {
  id: string;
  list_id: string;
  task_id: string | null;
  action: string;
  actor_type: string;
  actor_id: string;
  client_ip: string | null;
  user_agent: string | null;
  summary: string | null;
  created_at: number;
};

/** Prefer display name; fall back to email for signed-in actors. */
async function resolveActorLabels(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const placeholders = userIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT user_id, display_name, email FROM user_settings WHERE user_id IN (${placeholders})`
    )
    .bind(...userIds)
    .all<{ user_id: string; display_name: string | null; email: string | null }>();

  for (const row of results || []) {
    const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const email = typeof row.email === "string" ? row.email.trim() : "";
    map.set(row.user_id, name || email || resolveDisplayName(null));
  }
  for (const id of userIds) {
    if (!map.has(id)) map.set(id, resolveDisplayName(null));
  }
  return map;
}

/** Convenience summary for delete-request activity rows. */
export function deleteRequestActivitySummary(
  targetType: "task" | "list" | "clear_completed",
  targetLabel?: string | null
): string {
  if (targetType === "task") {
    return trimActivitySummary(targetLabel ? `Task: ${targetLabel}` : "Task") || "Task";
  }
  if (targetType === "clear_completed") return "Clear completed tasks";
  return "Entire list";
}

export { describeListActivityAction };
