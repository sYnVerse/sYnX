import { MAX_TASKS_PER_LIST } from "./write-limits";

/**
 * Guests (not signed in) get a `guest_<uuid>` id in the guest_session cookie.
 * Their own lists live in the browser's localStorage and never touch D1. The
 * only D1 writes a guest can make are task edits on lists shared as
 * "anyone can edit" (public_edit), and those are limited by the rules below.
 */

/** Exactly the ids getOptionalUser mints: `guest_` + crypto.randomUUID(). */
const GUEST_ID_PATTERN = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The same shape as a SQLite GLOB pattern ('_' and '-' are literal, '?' is any
 * one character), so SQL that cleans up guest rows matches only guest ids.
 */
export const GUEST_ID_GLOB = "guest_????????-????-????-????-????????????";

export function isGuestId(value: unknown): value is string {
  return typeof value === "string" && GUEST_ID_PATTERN.test(value);
}

/**
 * Page actions a guest may run on someone else's shared list.
 * Guests are view-only on all shared lists, even collaborative ones.
 * completing, editing tasks, and requesting deletes (task, clear completed,
 * or the list — the owner must approve). Anything that creates or changes a
 * reminder (reminders, repeats, marking a reminder sent) or renames/shares a
 * list needs a signed-in account.
 */
export const GUEST_SHARED_LIST_INTENTS: ReadonlySet<string> = new Set();

export const GUEST_REMINDER_DENIAL = "Sign in to set reminders.";

/** Why a guest can't run this intent on a shared list. */
export function guestIntentDenial(intent: string): string {
  if (intent === "updateReminder" || intent === "updateRecurrence" || intent === "markReminderSent") {
    return GUEST_REMINDER_DENIAL;
  }
  if (intent === "createList") {
    return "Sign in to save lists to your account. Guest lists stay in this browser.";
  }
  return "Sign in to edit this list.";
}

/** Guest writes allowed per guest id, and separately per IP, per minute. */
export const GUEST_WRITES_PER_MINUTE = 60;
export const GUEST_RATE_LIMIT_ERROR = "You're making changes too quickly. Wait a minute and try again.";

/**
 * Checks the guest write rate limit (Workers Rate Limiting binding
 * GUEST_WRITE_LIMITER, configured in wrangler.jsonc). Both the guest id and the
 * client IP must be under the limit, since a guest id is just a cookie that can
 * be thrown away. Returns true when the write may go ahead. Without the binding
 * (some local setups) it allows the write.
 */
export async function guestWriteAllowed(
  env: { GUEST_WRITE_LIMITER?: RateLimit },
  guestId: string,
  request: Request
): Promise<boolean> {
  const limiter = env.GUEST_WRITE_LIMITER;
  if (!limiter) return true;
  const keys = [`guest:${guestId}`];
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) keys.push(`guest-ip:${ip}`);
  try {
    const results = await Promise.all(keys.map((key) => limiter.limit({ key })));
    return results.every((r) => r.success);
  } catch (e) {
    console.error("Guest rate limit check failed:", e);
    return true;
  }
}

/** True when the list already holds the maximum number of tasks. */
export async function isListFull(db: D1Database, listId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM todos WHERE list_id = ?")
    .bind(listId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0) >= MAX_TASKS_PER_LIST;
}

/** Guest-created D1 lists were given a 24-hour expiration_ttl (in seconds). */
const DEFAULT_GUEST_LIST_TTL_SECONDS = 86400;

/**
 * Deletes D1 lists owned by guest ids once their expiration_ttl has passed,
 * along with their tasks and "Shared with me" rows. Guests can no longer
 * create D1 lists; this clears out ones made before that. Only rows whose
 * owner_id has the exact guest id shape are touched. Returns how many lists
 * were deleted.
 */
export async function deleteExpiredGuestLists(db: D1Database, now: number = Date.now()): Promise<number> {
  const expiredGuestLists = `SELECT id FROM lists
    WHERE owner_id GLOB ?
      AND created_at + COALESCE(expiration_ttl, ${DEFAULT_GUEST_LIST_TTL_SECONDS}) * 1000 <= ?`;
  const results = await db.batch([
    db
      .prepare(`DELETE FROM shared_list_access WHERE list_id IN (${expiredGuestLists})`)
      .bind(GUEST_ID_GLOB, now),
    db.prepare(`DELETE FROM todos WHERE list_id IN (${expiredGuestLists})`).bind(GUEST_ID_GLOB, now),
    db
      .prepare(
        `DELETE FROM lists
         WHERE owner_id GLOB ?
           AND created_at + COALESCE(expiration_ttl, ${DEFAULT_GUEST_LIST_TTL_SECONDS}) * 1000 <= ?`
      )
      .bind(GUEST_ID_GLOB, now),
  ]);
  return results[2]?.meta?.changes ?? 0;
}
