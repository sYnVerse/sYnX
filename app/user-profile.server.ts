import { isValidTimeZone } from "../shared";

/** Default display name when unset — never derived from email. */
export const DEFAULT_DISPLAY_NAME = "sYnX user";

const DISPLAY_NAME_MAX = 64;

export function resolveDisplayName(raw: string | null | undefined): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || DEFAULT_DISPLAY_NAME;
}

/** Sanitize a user-provided display name. Empty → null (store as unset). */
export function sanitizeDisplayNameInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, DISPLAY_NAME_MAX);
  return trimmed || null;
}

/**
 * Upsert email from the auth subject and ensure a settings row exists.
 * Does not overwrite an existing display_name.
 */
export async function syncUserProfileOnSignIn(
  db: D1Database,
  userId: string,
  email: string | null | undefined
): Promise<void> {
  const emailVal = typeof email === "string" ? email.trim() : "";
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, email)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = CASE
           WHEN excluded.email != '' THEN excluded.email
           ELSE user_settings.email
         END`
    )
    .bind(userId, emailVal)
    .run();
}

export async function getDisplayNameForUser(
  db: D1Database,
  userId: string
): Promise<string> {
  const row = await db
    .prepare("SELECT display_name FROM user_settings WHERE user_id = ?")
    .bind(userId)
    .first<{ display_name?: string | null }>();
  return resolveDisplayName(row?.display_name);
}

/** Batch-resolve display names for owner IDs (missing → default). */
export async function getDisplayNamesForUsers(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const id of unique) {
    map.set(id, DEFAULT_DISPLAY_NAME);
  }
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT user_id, display_name FROM user_settings WHERE user_id IN (${placeholders})`
    )
    .bind(...unique)
    .all<{ user_id: string; display_name: string | null }>();

  for (const row of results || []) {
    map.set(row.user_id, resolveDisplayName(row.display_name));
  }
  return map;
}

export function ownerPayload(displayName?: string | null): { displayName: string } {
  return { displayName: resolveDisplayName(displayName) };
}

/** The user's stored IANA time zone (reported by their devices), if any. */
export async function getUserTimeZone(
  db: D1Database,
  userId: string | null | undefined
): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const row = await db
      .prepare("SELECT time_zone FROM user_settings WHERE user_id = ?")
      .bind(userId)
      .first<{ time_zone?: string | null }>();
    return isValidTimeZone(row?.time_zone) ? row!.time_zone! : undefined;
  } catch (e) {
    // Best effort: without a stored zone, repeats are rescheduled in UTC rather
    // than failing the request. Log it so a real D1 error isn't silent.
    console.error(`Failed to read the home time zone for user ${userId}:`, e);
    return undefined;
  }
}

/**
 * Save the user's home time zone (used to keep repeating reminders at the same
 * local time). With `onlyIfUnset`, an existing value is never replaced: clients
 * use that to fill it in once from the device, and change it only when the
 * user asks. Returns the stored zone afterwards, or null for an invalid zone.
 */
export async function setUserTimeZone(
  db: D1Database,
  userId: string,
  email: string | null | undefined,
  timeZone: unknown,
  options: { onlyIfUnset?: boolean } = {}
): Promise<string | null> {
  if (!isValidTimeZone(timeZone)) return null;
  const guard = options.onlyIfUnset
    ? "user_settings.time_zone IS NULL OR user_settings.time_zone = ''"
    : "user_settings.time_zone IS NOT excluded.time_zone";
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, email, time_zone)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET time_zone = excluded.time_zone
       WHERE ${guard}`
    )
    .bind(userId, typeof email === "string" ? email.trim() : "", timeZone)
    .run();
  return (await getUserTimeZone(db, userId)) ?? null;
}
