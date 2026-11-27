import { decodeJwt } from "jose";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "./auth-cookies.server";

export type AuthSessionSource = "web" | "mobile";

/** Keep revoked session rows for 24h (well past 15-minute access JWT expiry) before pruning. */
export const REVOKED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Throttle `last_seen_at` writes on hot authenticated requests to once per 5 minutes. */
export const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export type AccessTokenSessionStatus =
  | { status: "active"; sessionId: string }
  | { status: "revoked"; sessionId: string }
  | { status: "untracked" };

export async function hashAccessToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getAccessTokenExpiryMs(token: string): number | undefined {
  try {
    const payload = decodeJwt(token);
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // Non-JWT or opaque test token falls back to default access TTL
  }
  return undefined;
}

function defaultAccessExpiresAt(
  nowMs: number,
  accessToken: string,
  accessExpiresAt?: number,
): number {
  return (
    accessExpiresAt ??
    getAccessTokenExpiryMs(accessToken) ??
    nowMs + ACCESS_TOKEN_MAX_AGE_SECONDS * 1000
  );
}

function defaultSessionExpiresAt(nowMs: number): number {
  return nowMs + REFRESH_TOKEN_MAX_AGE_SECONDS * 1000;
}

export async function createAuthSession(
  db: D1Database,
  options: {
    userId: string;
    source: AuthSessionSource;
    accessToken: string;
    accessExpiresAt?: number;
    now?: number;
  },
): Promise<string> {
  const nowMs = options.now ?? Date.now();
  const sessionId = crypto.randomUUID();
  const sessionExpiresAt = defaultSessionExpiresAt(nowMs);
  const tokenExpiresAt = defaultAccessExpiresAt(
    nowMs,
    options.accessToken,
    options.accessExpiresAt,
  );
  const tokenHash = await hashAccessToken(options.accessToken);

  await db.batch([
    db
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, source, created_at, last_seen_at, expires_at, revoked_at, revoked_reason)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .bind(
        sessionId,
        options.userId,
        options.source,
        nowMs,
        nowMs,
        sessionExpiresAt,
      ),
    db
      .prepare(
        `INSERT OR REPLACE INTO auth_session_tokens (token_hash, session_id, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(tokenHash, sessionId, options.userId, nowMs, tokenExpiresAt),
  ]);

  return sessionId;
}

export async function attachTokenToAuthSession(
  db: D1Database,
  options: {
    sessionId?: string | null;
    userId: string;
    source: AuthSessionSource;
    accessToken: string;
    accessExpiresAt?: number;
    now?: number;
  },
): Promise<{ ok: true; sessionId: string } | { ok: false; revoked: true }> {
  const nowMs = options.now ?? Date.now();
  const sessionExpiresAt = defaultSessionExpiresAt(nowMs);
  const tokenExpiresAt = defaultAccessExpiresAt(
    nowMs,
    options.accessToken,
    options.accessExpiresAt,
  );

  if (options.sessionId) {
    const existing = await db
      .prepare(
        `SELECT id, user_id, expires_at, revoked_at
         FROM auth_sessions
         WHERE id = ?`,
      )
      .bind(options.sessionId)
      .first<{
        id: string;
        user_id: string;
        expires_at: number;
        revoked_at: number | null;
      }>();

    if (existing && existing.user_id === options.userId) {
      if (existing.revoked_at !== null || existing.expires_at <= nowMs) {
        return { ok: false, revoked: true };
      }
      const tokenHash = await hashAccessToken(options.accessToken);
      await db.batch([
        db
          .prepare(
            `UPDATE auth_sessions
             SET last_seen_at = ?, expires_at = MAX(expires_at, ?)
             WHERE id = ?`,
          )
          .bind(nowMs, sessionExpiresAt, existing.id),
        db
          .prepare(
            `INSERT OR REPLACE INTO auth_session_tokens (token_hash, session_id, user_id, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(tokenHash, existing.id, options.userId, nowMs, tokenExpiresAt),
      ]);
      return { ok: true, sessionId: existing.id };
    }
  }

  const newSessionId = await createAuthSession(db, {
    userId: options.userId,
    source: options.source,
    accessToken: options.accessToken,
    accessExpiresAt: options.accessExpiresAt,
    now: nowMs,
  });
  return { ok: true, sessionId: newSessionId };
}

export async function checkAccessTokenSession(
  db: D1Database,
  accessToken: string,
  now?: number,
): Promise<AccessTokenSessionStatus> {
  const nowMs = now ?? Date.now();
  const tokenHash = await hashAccessToken(accessToken);

  const row = await db
    .prepare(
      `SELECT s.id AS session_id,
              s.revoked_at AS revoked_at,
              s.expires_at AS session_expires_at,
              s.last_seen_at AS last_seen_at,
              t.expires_at AS token_expires_at
       FROM auth_session_tokens t
       JOIN auth_sessions s ON s.id = t.session_id
       WHERE t.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      session_id: string;
      revoked_at: number | null;
      session_expires_at: number;
      last_seen_at: number;
      token_expires_at: number;
    }>();

  if (!row) {
    return { status: "untracked" };
  }

  if (
    row.revoked_at !== null ||
    row.session_expires_at <= nowMs ||
    row.token_expires_at <= nowMs
  ) {
    return { status: "revoked", sessionId: row.session_id };
  }

  if (nowMs - row.last_seen_at >= LAST_SEEN_UPDATE_INTERVAL_MS) {
    await db
      .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?")
      .bind(nowMs, row.session_id)
      .run();
  }

  return { status: "active", sessionId: row.session_id };
}

export async function isAuthSessionRevoked(
  db: D1Database,
  sessionId: string,
  now?: number,
): Promise<boolean> {
  const nowMs = now ?? Date.now();
  const row = await db
    .prepare("SELECT revoked_at, expires_at FROM auth_sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ revoked_at: number | null; expires_at: number }>();

  if (!row) return false;
  return row.revoked_at !== null || row.expires_at <= nowMs;
}

export async function revokeAuthSessionById(
  db: D1Database,
  sessionId: string,
  reason: string,
  now?: number,
): Promise<boolean> {
  const nowMs = now ?? Date.now();
  const result = await db
    .prepare(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, ?),
           revoked_reason = COALESCE(revoked_reason, ?),
           last_seen_at = ?
       WHERE id = ?`,
    )
    .bind(nowMs, reason, nowMs, sessionId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function revokeAuthSessionForToken(
  db: D1Database,
  options: {
    token: string;
    userId: string;
    source: AuthSessionSource;
    sessionId?: string | null;
    reason: string;
    accessExpiresAt?: number;
    now?: number;
  },
): Promise<{ sessionId: string }> {
  const nowMs = options.now ?? Date.now();
  const tokenHash = await hashAccessToken(options.token);
  const tokenExpiresAt = defaultAccessExpiresAt(
    nowMs,
    options.token,
    options.accessExpiresAt,
  );

  const byToken = await db
    .prepare(
      `SELECT s.id AS id
       FROM auth_session_tokens t
       JOIN auth_sessions s ON s.id = t.session_id
       WHERE t.token_hash = ? AND s.user_id = ?`,
    )
    .bind(tokenHash, options.userId)
    .first<{ id: string }>();

  let targetSessionId = byToken?.id ?? null;

  if (!targetSessionId && options.sessionId) {
    const byId = await db
      .prepare("SELECT id FROM auth_sessions WHERE id = ? AND user_id = ?")
      .bind(options.sessionId, options.userId)
      .first<{ id: string }>();
    targetSessionId = byId?.id ?? null;
  }

  if (targetSessionId) {
    await db.batch([
      db
        .prepare(
          `UPDATE auth_sessions
           SET revoked_at = COALESCE(revoked_at, ?),
               revoked_reason = COALESCE(revoked_reason, ?),
               last_seen_at = ?
           WHERE id = ?`,
        )
        .bind(nowMs, options.reason, nowMs, targetSessionId),
      db
        .prepare(
          `INSERT OR IGNORE INTO auth_session_tokens (token_hash, session_id, user_id, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(tokenHash, targetSessionId, options.userId, nowMs, tokenExpiresAt),
    ]);
    return { sessionId: targetSessionId };
  }

  // Fallback for pre-migration tokens or offline sign-ins: record an immediately revoked row.
  const revokedSessionId = crypto.randomUUID();
  const sessionExpiresAt = defaultSessionExpiresAt(nowMs);
  await db.batch([
    db
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, source, created_at, last_seen_at, expires_at, revoked_at, revoked_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        revokedSessionId,
        options.userId,
        options.source,
        nowMs,
        nowMs,
        sessionExpiresAt,
        nowMs,
        options.reason,
      ),
    db
      .prepare(
        `INSERT OR REPLACE INTO auth_session_tokens (token_hash, session_id, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        tokenHash,
        revokedSessionId,
        options.userId,
        nowMs,
        tokenExpiresAt,
      ),
  ]);

  return { sessionId: revokedSessionId };
}

export async function pruneExpiredAuthSessions(
  db: D1Database,
  now?: number,
): Promise<{ sessionsDeleted: number; tokensDeleted: number }> {
  const nowMs = now ?? Date.now();
  const revokedCutoff = nowMs - REVOKED_SESSION_RETENTION_MS;

  const [tokensResult, sessionsResult] = await db.batch([
    db
      .prepare("DELETE FROM auth_session_tokens WHERE expires_at <= ?")
      .bind(nowMs),
    db
      .prepare(
        `DELETE FROM auth_sessions
         WHERE expires_at <= ?
            OR (revoked_at IS NOT NULL AND revoked_at <= ?)`,
      )
      .bind(nowMs, revokedCutoff),
  ]);

  return {
    tokensDeleted: tokensResult.meta?.changes ?? 0,
    sessionsDeleted: sessionsResult.meta?.changes ?? 0,
  };
}
