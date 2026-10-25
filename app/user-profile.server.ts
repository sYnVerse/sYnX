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

/** Ensure additive profile/shared-list schema exists (safe on repeat). */
export async function ensureUserProfileSchema(db: D1Database): Promise<void> {
  try {
    await db.prepare("ALTER TABLE user_settings ADD COLUMN display_name TEXT").run();
  } catch {
    // Column already exists
  }
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS shared_list_access (
          user_id TEXT NOT NULL,
          list_id TEXT NOT NULL,
          opened_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, list_id),
          FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
        )`
      )
      .run();
  } catch {
    // Table already exists or FK unsupported in some test envs
  }
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
  await ensureUserProfileSchema(db);
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
  await ensureUserProfileSchema(db);
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
  await ensureUserProfileSchema(db);
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
