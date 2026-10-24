/**
 * Cookie helpers for the web BFF auth flow (session + short-lived PKCE/state + refresh token).
 * Kept free of Remix imports so unit tests can exercise them in isolation.
 */

export const AUTH_SESSION_COOKIE = "synx_auth_session";
export const AUTH_REFRESH_COOKIE = "synx_refresh_session";
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60; // 15 minutes (900s)
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 14 * 24 * 60 * 60; // 14 days (1,209,600s)

/** Short-lived host-only cookie holding OAuth `state` + PKCE `verifier` for the web BFF. */
export const PKCE_COOKIE_NAME = "synx_oauth_pkce";
export const PKCE_MAX_AGE_SECONDS = 300; // 5 minutes

export type OAuthPkceChallenge = {
  state: string;
  verifier: string;
};

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
 * PKCE/state cookie attributes: host-only (no Domain) so the verifier stays on this
 * app origin (synx.christran.io or localhost) and is never shared across sibling apps.
 */
export function getPkceCookieAttributes(
  requestUrl: string,
  maxAge: number = PKCE_MAX_AGE_SECONDS,
): string {
  const url = new URL(requestUrl);
  const secureAttr = url.protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr}`;
}

export function serializePkceCookie(
  requestUrl: string,
  challenge: OAuthPkceChallenge,
  maxAge: number = PKCE_MAX_AGE_SECONDS,
): string {
  const payload = JSON.stringify({
    state: challenge.state,
    verifier: challenge.verifier,
  });
  return `${PKCE_COOKIE_NAME}=${encodeURIComponent(payload)}; ${getPkceCookieAttributes(requestUrl, maxAge)}`;
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

/** Clear session + refresh + any in-flight PKCE cookie (e.g. /logout?local=true). */
export function buildAuthClearCookieHeaders(requestUrl: string): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", clearAuthSessionCookie(requestUrl));
  headers.append("Set-Cookie", clearAuthRefreshCookie(requestUrl));
  headers.append("Set-Cookie", clearPkceCookie(requestUrl));
  return headers;
}

/**
 * Headers for redirecting to central sYnID logout.
 * Clears only the short-lived PKCE cookie — not synx_auth_session / synx_refresh_session — so
 * "Cancel and return" on sYnID can keep the user signed in locally.
 * Session clearing is done by sYnID (/logout/all) or by /logout?local=true.
 */
export function buildCentralLogoutClearHeaders(requestUrl: string): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", clearPkceCookie(requestUrl));
  return headers;
}

export function parsePkceCookie(request: Request): OAuthPkceChallenge | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${PKCE_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as {
      state?: unknown;
      verifier?: unknown;
    };
    if (
      typeof parsed.state !== "string" ||
      !parsed.state ||
      typeof parsed.verifier !== "string" ||
      !parsed.verifier
    ) {
      return null;
    }
    return { state: parsed.state, verifier: parsed.verifier };
  } catch {
    return null;
  }
}

export function parseRefreshCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_REFRESH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
