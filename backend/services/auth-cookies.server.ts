/**
 * Cookie helpers for the web BFF auth flow (session + short-lived PKCE/state + refresh token).
 * Kept free of Remix imports so unit tests can exercise them in isolation.
 */

export const AUTH_SESSION_COOKIE = "synx_auth_session";
export const AUTH_REFRESH_COOKIE = "synx_refresh_session";
export const AUTH_SESSION_ID_COOKIE = "synx_session_id";
export const GUEST_SESSION_COOKIE = "guest_session";
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60; // 15 minutes (900s)
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 14 * 24 * 60 * 60; // 14 days (1,209,600s)
export const GUEST_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days (2,592,000s)

/** Short-lived host-only cookie holding OAuth `state` + PKCE `verifier` for the web BFF. */
export const PKCE_COOKIE_NAME = "synx_oauth_pkce";
export const PKCE_MAX_AGE_SECONDS = 300; // 5 minutes

/**
 * Extracts an exact cookie value by name from a raw `Cookie` header without
 * substring matching look-alike cookie names.
 */
export function parseCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader || !name) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key !== name) continue;
    const rawVal = trimmed.slice(eqIndex + 1).trim();
    if (!rawVal) return null;
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return null;
    }
  }
  return null;
}

export type OAuthPkceChallenge = {
  state: string;
  verifier: string;
  redirectTo?: string;
};

/**
 * Validates a redirect path to ensure it is a safe, relative application path:
 * - Must start with `/`
 * - Must NOT start with `//` (protocol-relative open redirect)
 * - Must NOT include `\` (backslash navigation exploit)
 * - Must NOT target auth callback/login/logout endpoints directly
 */
export function parseSafeRedirectTo(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\")
  ) {
    const pathname = trimmed.split("?")[0].toLowerCase();
    if (
      pathname === "/login" ||
      pathname === "/logout" ||
      pathname === "/callback" ||
      pathname === "/mobile/callback"
    ) {
      return undefined;
    }
    return trimmed;
  }
  return undefined;
}

export function getCookieDomain(requestUrl: string): string {
  const url = new URL(requestUrl);
  const hostname = url.hostname;
  if (hostname.endsWith(".christran.io")) {
    return ".christran.io";
  }
  return "";
}

export function getCookieAttributes(requestUrl: string, maxAge: number = 0): string {
  const url = new URL(requestUrl);
  const domain = getCookieDomain(requestUrl);
  const domainAttr = domain ? `; Domain=${domain}` : "";
  const secureAttr = url.protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${domainAttr}${secureAttr}`;
}

/**
 * Host-only cookie attributes (no Domain) so the cookie stays on this app origin
 * (synx.christran.io or localhost), adding Secure on HTTPS.
 */
export function getHostOnlyCookieAttributes(
  requestUrl: string,
  maxAge: number = 0,
): string {
  const url = new URL(requestUrl);
  const secureAttr = url.protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr}`;
}

/**
 * PKCE/state cookie attributes: host-only (no Domain) so the verifier stays on this
 * app origin (synx.christran.io or localhost) and is never shared across sibling apps.
 */
export function getPkceCookieAttributes(
  requestUrl: string,
  maxAge: number = PKCE_MAX_AGE_SECONDS,
): string {
  return getHostOnlyCookieAttributes(requestUrl, maxAge);
}

export function serializePkceCookie(
  requestUrl: string,
  challenge: OAuthPkceChallenge,
  maxAge: number = PKCE_MAX_AGE_SECONDS,
): string {
  const payload: { state: string; verifier: string; redirectTo?: string } = {
    state: challenge.state,
    verifier: challenge.verifier,
  };
  if (challenge.redirectTo) {
    payload.redirectTo = challenge.redirectTo;
  }
  return `${PKCE_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; ${getPkceCookieAttributes(requestUrl, maxAge)}`;
}

export function clearPkceCookie(requestUrl: string): string {
  return `${PKCE_COOKIE_NAME}=; ${getPkceCookieAttributes(requestUrl, 0)}`;
}

export function serializeAuthSessionCookie(
  requestUrl: string,
  token: string,
  maxAge: number = ACCESS_TOKEN_MAX_AGE_SECONDS,
): string {
  return `${AUTH_SESSION_COOKIE}=${encodeURIComponent(token)}; ${getCookieAttributes(requestUrl, maxAge)}`;
}

export function clearAuthSessionCookie(requestUrl: string): string {
  return `${AUTH_SESSION_COOKIE}=; ${getCookieAttributes(requestUrl, 0)}`;
}

export function serializeAuthRefreshCookie(
  requestUrl: string,
  token: string,
  maxAge: number = REFRESH_TOKEN_MAX_AGE_SECONDS,
): string {
  return `${AUTH_REFRESH_COOKIE}=${encodeURIComponent(token)}; ${getCookieAttributes(requestUrl, maxAge)}`;
}

export function clearAuthRefreshCookie(requestUrl: string): string {
  return `${AUTH_REFRESH_COOKIE}=; ${getCookieAttributes(requestUrl, 0)}`;
}

export function serializeAuthSessionIdCookie(
  requestUrl: string,
  sessionId: string,
  maxAge: number = REFRESH_TOKEN_MAX_AGE_SECONDS,
): string {
  return `${AUTH_SESSION_ID_COOKIE}=${encodeURIComponent(sessionId)}; ${getHostOnlyCookieAttributes(requestUrl, maxAge)}`;
}

export function clearAuthSessionIdCookie(requestUrl: string): string {
  return `${AUTH_SESSION_ID_COOKIE}=; ${getHostOnlyCookieAttributes(requestUrl, 0)}`;
}

export function serializeGuestSessionCookie(
  requestUrl: string,
  guestId: string,
  maxAge: number = GUEST_SESSION_MAX_AGE_SECONDS,
): string {
  return `${GUEST_SESSION_COOKIE}=${encodeURIComponent(guestId)}; ${getHostOnlyCookieAttributes(requestUrl, maxAge)}`;
}

/** Clear session + refresh + host-only session id + any in-flight PKCE cookie (e.g. /logout?local=true). */
export function buildAuthClearCookieHeaders(requestUrl: string): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", clearAuthSessionCookie(requestUrl));
  headers.append("Set-Cookie", clearAuthRefreshCookie(requestUrl));
  headers.append("Set-Cookie", clearAuthSessionIdCookie(requestUrl));
  headers.append("Set-Cookie", clearPkceCookie(requestUrl));
  return headers;
}

/**
 * Headers for redirecting to central sYnID logout.
 * Clears only the short-lived PKCE cookie — not synx_auth_session / synx_refresh_session /
 * synx_session_id — so "Cancel and return" on sYnID can keep the user signed in locally.
 * Session clearing is done by sYnID (/logout/all) or by /logout?local=true.
 */
export function buildCentralLogoutClearHeaders(requestUrl: string): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", clearPkceCookie(requestUrl));
  return headers;
}

export function parseAuthSessionCookie(request: Request): string | null {
  return parseCookieValue(request.headers.get("Cookie"), AUTH_SESSION_COOKIE);
}

export function parseSessionIdCookie(request: Request): string | null {
  return parseCookieValue(request.headers.get("Cookie"), AUTH_SESSION_ID_COOKIE);
}

export function parseGuestSessionCookie(request: Request): string | null {
  return parseCookieValue(request.headers.get("Cookie"), GUEST_SESSION_COOKIE);
}

export function parsePkceCookie(request: Request): OAuthPkceChallenge | null {
  const raw = parseCookieValue(request.headers.get("Cookie"), PKCE_COOKIE_NAME);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      state?: unknown;
      verifier?: unknown;
      redirectTo?: unknown;
    };
    if (
      typeof parsed.state !== "string" ||
      !parsed.state ||
      typeof parsed.verifier !== "string" ||
      !parsed.verifier
    ) {
      return null;
    }
    const challenge: OAuthPkceChallenge = {
      state: parsed.state,
      verifier: parsed.verifier,
    };
    const safeRedirect = parseSafeRedirectTo(
      typeof parsed.redirectTo === "string" ? parsed.redirectTo : undefined,
    );
    if (safeRedirect) {
      challenge.redirectTo = safeRedirect;
    }
    return challenge;
  } catch {
    return null;
  }
}

export function parseRefreshCookie(request: Request): string | null {
  return parseCookieValue(request.headers.get("Cookie"), AUTH_REFRESH_COOKIE);
}
