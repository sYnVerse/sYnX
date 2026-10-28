import { sanitizeDisplayNameInput } from "./user-profile.server";

/**
 * Provider profile (photo + suggested display name) from sYnID's GET /userinfo.
 *
 * Everything here is best-effort: if sYnID is unreachable, slow, or doesn't have
 * /userinfo yet (404), sign-in and page loads carry on unchanged. The provider
 * name is only ever stored as a *suggestion*; display_name changes only when the
 * user accepts it.
 */

/** How long a successful or failed /userinfo check is reused before asking again. */
export const PROVIDER_PROFILE_TTL_MS = 6 * 60 * 60 * 1000;
const USERINFO_TIMEOUT_MS = 2500;
const MAX_AVATAR_URL_LENGTH = 2048;

export type ProviderProfileInfo = { name: string | null; picture: string | null };

/** Only https photos on Google's or GitHub's avatar hosts. */
export function sanitizeProviderAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_AVATAR_URL_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const allowed =
    host === "avatars.githubusercontent.com" ||
    host === "googleusercontent.com" ||
    host.endsWith(".googleusercontent.com");
  return allowed ? u.toString() : null;
}

/** GET {issuer}/userinfo. Returns null on any error, timeout, or non-200 (e.g. 404). */
export async function fetchProviderProfile(
  issuer: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProviderProfileInfo | null> {
  try {
    const res = await fetchImpl(`${issuer.replace(/\/+$/, "")}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: unknown; picture?: unknown };
    if (!body || typeof body !== "object") return null;
    return {
      name: sanitizeDisplayNameInput(body.name),
      picture: sanitizeProviderAvatarUrl(body.picture),
    };
  } catch {
    return null;
  }
}

/**
 * Refresh the stored provider photo and suggested name for a signed-in user.
 * Skips the network call when checked within PROVIDER_PROFILE_TTL_MS unless
 * `force` (used right after sign-in). Never writes display_name. Never throws.
 */
export async function syncProviderProfile(
  db: D1Database,
  input: {
    userId: string;
    email: string | null | undefined;
    accessToken: string | null | undefined;
    issuer: string;
    force?: boolean;
    now?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<void> {
  if (!input.accessToken) return;
  const now = input.now ?? Date.now();
  try {
    if (!input.force) {
      const row = await db
        .prepare("SELECT provider_profile_synced_at FROM user_settings WHERE user_id = ?")
        .bind(input.userId)
        .first<{ provider_profile_synced_at: number | null }>();
      const last = Number(row?.provider_profile_synced_at || 0);
      if (last && now - last < PROVIDER_PROFILE_TTL_MS) return;
    }

    const info = await fetchProviderProfile(input.issuer, input.accessToken, input.fetchImpl);
    const email = typeof input.email === "string" ? input.email.trim() : "";

    if (!info) {
      // Remember the attempt so a missing or failing endpoint isn't retried on every load.
      await db
        .prepare(
          `INSERT INTO user_settings (user_id, email, provider_profile_synced_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET provider_profile_synced_at = excluded.provider_profile_synced_at`
        )
        .bind(input.userId, email, now)
        .run();
      return;
    }

    await db
      .prepare(
        `INSERT INTO user_settings (user_id, email, avatar_url, suggested_display_name, provider_profile_synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           avatar_url = excluded.avatar_url,
           suggested_display_name = excluded.suggested_display_name,
           provider_profile_synced_at = excluded.provider_profile_synced_at`
      )
      .bind(input.userId, email, info.picture, info.name, now)
      .run();
  } catch (e) {
    console.error("Provider profile sync failed:", e);
  }
}

/** Fields the web and mobile apps read alongside settings. */
export function providerProfileFields(row: {
  display_name?: string | null;
  avatar_url?: string | null;
  suggested_display_name?: string | null;
  display_name_suggestion_dismissed?: number | null;
} | null | undefined): { avatarUrl: string | null; suggestedDisplayName: string | null } {
  const displayNameSet = Boolean(row?.display_name && String(row.display_name).trim());
  const suggestion = sanitizeDisplayNameInput(row?.suggested_display_name);
  return {
    avatarUrl: sanitizeProviderAvatarUrl(row?.avatar_url),
    suggestedDisplayName:
      !displayNameSet && !row?.display_name_suggestion_dismissed ? suggestion : null,
  };
}

/** Save the stored suggestion as the display name, only if none is set yet. */
export async function acceptSuggestedDisplayName(db: D1Database, userId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE user_settings
       SET display_name = suggested_display_name, display_name_suggestion_dismissed = 1
       WHERE user_id = ?
         AND (display_name IS NULL OR TRIM(display_name) = '')
         AND suggested_display_name IS NOT NULL AND TRIM(suggested_display_name) != ''`
    )
    .bind(userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Stop offering the provider name. */
export async function dismissSuggestedDisplayName(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("UPDATE user_settings SET display_name_suggestion_dismissed = 1 WHERE user_id = ?")
    .bind(userId)
    .run();
}
