import { createClient } from "@openauthjs/openauth/client";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import {
  AUTH_SESSION_COOKIE,
  buildAuthClearCookieHeaders,
  parseRefreshCookie,
  parseSafeRedirectTo,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
} from "./auth-cookies.server";
import { isGuestId } from "./guest-access.server";

export {
  AUTH_SESSION_COOKIE,
  PKCE_COOKIE_NAME,
  PKCE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  buildAuthClearCookieHeaders,
  buildCentralLogoutClearHeaders,
  clearPkceCookie,
  getCookieAttributes,
  getCookieDomain,
  getPkceCookieAttributes,
  parsePkceCookie,
  parseRefreshCookie,
  parseSafeRedirectTo,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
  serializePkceCookie,
} from "./auth-cookies.server";
export type { OAuthPkceChallenge } from "./auth-cookies.server";

export interface AuthEnv {
  CLIENT_ID_MAP?: string | Record<string, string>;
  OPENAUTH_ISSUER?: string;
  SYNX_ALLOWED_CLIENT_IDS?: string;
  ALLOW_DEV_TEST_AUTH?: string;
  ALLOW_DEV_REDIRECTS?: string;
}

export const LOCAL_TEST_TOKEN_PREFIX = "e2e_test_session:";

export function isLocalTestAuthAllowed(
  request: Request,
  env: AuthEnv | null | undefined,
): boolean {
  if (env?.ALLOW_DEV_TEST_AUTH !== "true") return false;

  try {
    const url = new URL(request.url);
    if (url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function mintLocalTestToken({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): string {
  return `${LOCAL_TEST_TOKEN_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(email)}`;
}

export function isLocalTestToken(token: string | null | undefined): boolean {
  return Boolean(token && token.startsWith(LOCAL_TEST_TOKEN_PREFIX));
}

export function parseLocalTestToken(
  token: string,
): { userId: string; email: string } | null {
  if (!isLocalTestToken(token)) return null;
  const payload = token.slice(LOCAL_TEST_TOKEN_PREFIX.length);
  const colon = payload.indexOf(":");
  if (colon <= 0) return null;
  try {
    const userId = decodeURIComponent(payload.slice(0, colon)).trim();
    const email = decodeURIComponent(payload.slice(colon + 1)).trim();
    if (!userId || !email || userId === "guest" || userId.startsWith("guest_") || isGuestId(userId)) return null;
    return { userId, email };
  } catch {
    return null;
  }
}

export interface TestLoginResult {
  allowed: boolean;
  error?: { message: string; status: number };
  session?: {
    userId: string;
    email: string;
    displayName?: string;
    suggestedName?: string;
    redirectTo: string;
    token: string;
  };
}

export function parseTestLoginRequest(
  request: Request,
  env: AuthEnv | null | undefined,
): TestLoginResult {
  if (!isLocalTestAuthAllowed(request, env)) {
    return { allowed: false };
  }

  const url = new URL(request.url);
  const isTestLoginRequested =
    url.searchParams.get("test_login") === "true" ||
    url.searchParams.get("test_login") === "1" ||
    url.searchParams.has("test_user_id") ||
    url.searchParams.has("userId");

  if (!isTestLoginRequested) {
    return { allowed: false };
  }

  const hasRawUserIdParam =
    url.searchParams.has("test_user_id") || url.searchParams.has("userId");
  const rawUserId = (
    url.searchParams.get("test_user_id") || url.searchParams.get("userId")
  )?.trim();

  if (hasRawUserIdParam && !rawUserId) {
    return {
      allowed: true,
      error: { message: "Invalid test user ID: ID cannot be empty", status: 400 },
    };
  }

  if (
    rawUserId &&
    (rawUserId === "guest" || rawUserId.startsWith("guest_") || isGuestId(rawUserId))
  ) {
    return {
      allowed: true,
      error: {
        message: "Invalid test user ID: guest IDs cannot be used for authenticated sessions",
        status: 400,
      },
    };
  }

  const rawEmail = (
    url.searchParams.get("test_email") || url.searchParams.get("email")
  )?.trim();

  if (rawEmail && !rawEmail.includes("@")) {
    return {
      allowed: true,
      error: { message: "Invalid test email: must be a valid email address", status: 400 },
    };
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const guestMatch = cookieHeader.match(/guest_session=([^;]+)/);
  const guestId = guestMatch ? decodeURIComponent(guestMatch[1]) : null;

  const userId =
    rawUserId ||
    (guestId ? `user_${guestId}` : `user_e2e_${crypto.randomUUID().slice(0, 8)}`);
  const email = rawEmail || `${userId}@e2e.local`;
  const displayName = (
    url.searchParams.get("test_display_name") || url.searchParams.get("displayName")
  )?.trim();
  const suggestedName = (
    url.searchParams.get("test_suggested_name") ||
    url.searchParams.get("suggestedName")
  )?.trim();
  const redirectToRaw = url.searchParams.get("redirectTo")?.trim();
  const redirectTo = parseSafeRedirectTo(redirectToRaw) || "/";

  const token = mintLocalTestToken({ userId, email });

  return {
    allowed: true,
    session: {
      userId,
      email,
      displayName,
      suggestedName,
      redirectTo,
      token,
    },
  };
}

export const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
  }),
});

const clients = new Map<string, ReturnType<typeof createClient>>();

function redirect(url: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Location", url);
  return new Response(null, {
    status: init?.status ?? 302,
    headers,
  });
}

/**
 * Request-scoped storage for refreshed session cookies minted during SSR.
 * Collected by server.ts to append Set-Cookie headers onto outgoing responses.
 */
const requestRefreshedCookiesMap = new WeakMap<Request, string[]>();

export function getRefreshedCookies(request: Request): string[] {
  return requestRefreshedCookiesMap.get(request) || [];
}

export function recordRefreshedCookies(request: Request, cookies: string[]) {
  const existing = requestRefreshedCookiesMap.get(request) || [];
  requestRefreshedCookiesMap.set(request, [...existing, ...cookies]);
}

function getClientID(request: Request, env: AuthEnv | null | undefined, defaultClientID: string): string {
  const url = new URL(request.url);
  if (env && env.CLIENT_ID_MAP) {
    try {
      const map: unknown = typeof env.CLIENT_ID_MAP === "string"
        ? JSON.parse(env.CLIENT_ID_MAP)
        : env.CLIENT_ID_MAP;
      if (map && typeof map === "object") {
        const record = map as Record<string, unknown>;
        if (typeof record[url.hostname] === "string") {
          return record[url.hostname] as string;
        }
        for (const [key, value] of Object.entries(record)) {
          if (url.hostname.includes(key) && typeof value === "string") {
            return value;
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse CLIENT_ID_MAP:", e);
    }
  }
  return defaultClientID;
}

export function getAuthSettings(request: Request, env: AuthEnv | null | undefined) {
  const clientID = getClientID(request, env, "synx");
  const issuer = (env && env.OPENAUTH_ISSUER) || "https://auth.christran.io";
  return { clientID, issuer };
}

export function getAuthClient(request: Request, env: AuthEnv | null | undefined) {
  const { clientID, issuer } = getAuthSettings(request, env);
  const cacheKey = `${clientID}:${issuer}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = createClient({
      clientID,
      issuer,
    });
    clients.set(cacheKey, client);
  }
  return client;
}

/**
 * OAuth client IDs whose sYnID access tokens sYnX accepts. sYnID issues every
 * access token with `aud` set to the client ID that requested it, and the same
 * issuer signs tokens for other apps (illusYn, sYnapse). OpenAuth's
 * `client.verify` checks the signature, issuer, expiry, and token mode, but not
 * the audience, so sYnX checks it here. Both the web app and the mobile app sign
 * in as `synx`.
 */
export const DEFAULT_ALLOWED_CLIENT_IDS: readonly string[] = ["synx"];

/**
 * Allowed audiences for this deployment. `SYNX_ALLOWED_CLIENT_IDS` (comma-separated)
 * can override the default, e.g. for a preview host mapped to another client via
 * `CLIENT_ID_MAP`. Unset or empty falls back to the safe default.
 */
export function getAllowedClientIDs(env: AuthEnv | null | undefined): string[] {
  const raw = env?.SYNX_ALLOWED_CLIENT_IDS;
  if (typeof raw === "string") {
    const ids = raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length > 0) return ids;
  }
  return [...DEFAULT_ALLOWED_CLIENT_IDS];
}

/**
 * True when a verified token's `aud` claim names only allowed clients.
 * A missing or empty audience is rejected.
 */
export function isAllowedAudience(aud: unknown, allowed: readonly string[]): boolean {
  const values = typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud : [];
  if (values.length === 0) return false;
  return values.every((value) => typeof value === "string" && allowed.includes(value));
}

export type VerifiedAccessToken = { userId: string; email: string };

/**
 * Single entry point for validating a sYnID access token in sYnX.
 * Runs OpenAuth's `verify` (signature, issuer, expiry, access mode, subject
 * schema), then requires the verified `aud` to be one of sYnX's own client IDs.
 * Returns null for any invalid or foreign token; never throws.
 */
export async function verifyAccessToken(
  request: Request,
  env: AuthEnv | null | undefined,
  token: string | null | undefined,
): Promise<VerifiedAccessToken | null> {
  if (!token) return null;
  if (isLocalTestToken(token)) {
    if (!isLocalTestAuthAllowed(request, env)) return null;
    return parseLocalTestToken(token);
  }
  const client = getAuthClient(request, env);
  try {
    const verified = await client.verify(subjects, token);
    if (verified.err) return null;
    if (!isAllowedAudience(verified.aud, getAllowedClientIDs(env))) {
      console.warn("Rejected sYnID access token issued to another client");
      return null;
    }
    const properties = verified.subject.properties;
    return {
      userId: properties.id,
      email: properties.email,
    };
  } catch {
    // Verification error (e.g. expired, malformed, JWKS unavailable)
    return null;
  }
}

/**
 * Attempts silent session renewal using the synx_refresh_session cookie.
 * On success, verifies the new access token, records refreshed Set-Cookie headers,
 * and returns the authenticated user payload.
 */
export async function trySilentRefresh(
  request: Request,
  env: AuthEnv | null | undefined,
  expiredToken?: string | null,
): Promise<{ userId: string; email: string; token: string } | null> {
  const refreshToken = parseRefreshCookie(request);
  if (!refreshToken) return null;

  const client = getAuthClient(request, env);
  try {
    const refreshed = await client.refresh(refreshToken, {
      access: expiredToken || undefined,
    });
    if (refreshed.err || !refreshed.tokens) {
      return null;
    }

    const newAccessToken = refreshed.tokens.access;
    // Never hand back (or store) a refreshed token minted for another client.
    const verified = await verifyAccessToken(request, env, newAccessToken);
    if (!verified) {
      return null;
    }

    const cookieHeaders: string[] = [
      serializeAuthSessionCookie(request.url, newAccessToken),
    ];
    if (refreshed.tokens.refresh) {
      cookieHeaders.push(
        serializeAuthRefreshCookie(request.url, refreshed.tokens.refresh),
      );
    }
    recordRefreshedCookies(request, cookieHeaders);

    return {
      userId: verified.userId,
      email: verified.email,
      token: newAccessToken,
    };
  } catch (err) {
    console.error("Web silent refresh failed:", err);
    return null;
  }
}

export async function requireUser(request: Request, env: AuthEnv | null | undefined) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  const verified = await verifyAccessToken(request, env, token);
  if (verified && token) {
    return { ...verified, token };
  }

  // Attempt silent renewal if the access token is missing, expired, or not issued to sYnX
  const renewed = await trySilentRefresh(request, env, token);
  if (renewed) {
    return renewed;
  }

  // Both token verification and refresh failed: clear cookies and redirect to login
  throw redirect("/login", {
    headers: buildAuthClearCookieHeaders(request.url),
  });
}

export async function getOptionalUser(request: Request, env: AuthEnv | null | undefined) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  const verified = await verifyAccessToken(request, env, token);
  if (verified) {
    return {
      userId: verified.userId,
      email: verified.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      /** The verified sYnID access token (server-side only; never send to the client). */
      accessToken: token as string | null,
    };
  }

  // Attempt silent renewal if access token is missing or expired
  const renewed = await trySilentRefresh(request, env, token);
  if (renewed) {
    return {
      userId: renewed.userId,
      email: renewed.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      accessToken: renewed.token as string | null,
    };
  }

  // Handle guest fallback
  // Only accept a cookie that holds an id this app minted (guest_<uuid>);
  // anything else gets a fresh guest id, so a guest can never act as another
  // user's id.
  const guestMatch = cookieHeader.match(/guest_session=([^;]+)/);
  let guestId: string | null = null;
  if (guestMatch) {
    try {
      const candidate = decodeURIComponent(guestMatch[1]);
      if (isGuestId(candidate)) guestId = candidate;
    } catch {
      // Malformed cookie value; treat as no guest session.
    }
  }
  let isNewGuest = false;
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID()}`;
    isNewGuest = true;
  }

  return {
    userId: guestId,
    email: "Guest User",
    isLoggedIn: false,
    guestId,
    isNewGuest,
    accessToken: null as string | null,
  };
}

export async function verifyBearerToken(request: Request, env: AuthEnv | null | undefined) {
  const authHeader = request.headers.get("Authorization") || "";
  let token: string | null = null;
  const isBearer = authHeader.startsWith("Bearer ");
  if (isBearer) {
    token = authHeader.substring(7).trim();
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const cookieToken = match ? decodeURIComponent(match[1]) : null;

  if (!token && cookieToken) {
    token = cookieToken;
  }

  const verified = await verifyAccessToken(request, env, token);
  if (verified && token) {
    return { ...verified, token };
  }

  // If this was a cookie-backed session and the access token expired, try silent refresh
  if (!isBearer) {
    const renewed = await trySilentRefresh(request, env, token);
    if (renewed) {
      return {
        userId: renewed.userId,
        email: renewed.email,
        token: renewed.token,
      };
    }
  }

  return null;
}
