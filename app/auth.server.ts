import { createClient } from "@openauthjs/openauth/client";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  buildAuthClearCookieHeaders,
  clearAuthRefreshCookie,
  clearAuthSessionCookie,
  parseRefreshCookie,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
} from "./auth-cookies.server";

export {
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  PKCE_COOKIE_NAME,
  PKCE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  buildAuthClearCookieHeaders,
  buildCentralLogoutClearHeaders,
  clearAuthRefreshCookie,
  clearAuthSessionCookie,
  clearPkceCookie,
  getCookieAttributes,
  getCookieDomain,
  getPkceCookieAttributes,
  parsePkceCookie,
  parseRefreshCookie,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
  serializePkceCookie,
} from "./auth-cookies.server";
export type { OAuthPkceChallenge } from "./auth-cookies.server";

export const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
  }) as any,
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

function getClientID(request: Request, env: any, defaultClientID: string): string {
  const url = new URL(request.url);
  if (env && env.CLIENT_ID_MAP) {
    try {
      const map = typeof env.CLIENT_ID_MAP === "string"
        ? JSON.parse(env.CLIENT_ID_MAP)
        : env.CLIENT_ID_MAP;
      if (map && typeof map === "object") {
        if (map[url.hostname]) {
          return map[url.hostname];
        }
        for (const [key, value] of Object.entries(map)) {
          if (url.hostname.includes(key)) {
            return value as string;
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse CLIENT_ID_MAP:", e);
    }
  }
  return defaultClientID;
}

export function getAuthSettings(request: Request, env: any) {
  const clientID = getClientID(request, env, "synx");
  const issuer = (env && env.OPENAUTH_ISSUER) || "https://auth.christran.io";
  return { clientID, issuer };
}

export function getAuthClient(request: Request, env: any) {
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
 * Attempts silent session renewal using the synx_refresh_session cookie.
 * On success, verifies the new access token, records refreshed Set-Cookie headers,
 * and returns the authenticated user payload.
 */
export async function trySilentRefresh(
  request: Request,
  env: any,
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
    const verified = await client.verify(subjects as any, newAccessToken);
    if (verified.err) {
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

    const properties = (verified.subject as any).properties;
    return {
      userId: properties.id as string,
      email: properties.email as string,
      token: newAccessToken,
    };
  } catch (err) {
    console.error("Web silent refresh failed:", err);
    return null;
  }
}

export async function requireUser(request: Request, env: any) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  const client = getAuthClient(request, env);

  if (token) {
    try {
      const verified = await client.verify(subjects as any, token);
      if (!verified.err) {
        const properties = (verified.subject as any).properties;
        return {
          userId: properties.id as string,
          email: properties.email as string,
          token,
        };
      }
    } catch {
      // Verification failed (e.g. token expired) — fall through to silent refresh
    }
  }

  // Attempt silent renewal if access token is missing or expired
  const renewed = await trySilentRefresh(request, env, token);
  if (renewed) {
    return renewed;
  }

  // Both token verification and refresh failed: clear cookies and redirect to login
  throw redirect("/login", {
    headers: buildAuthClearCookieHeaders(request.url),
  });
}

export async function getOptionalUser(request: Request, env: any) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  const client = getAuthClient(request, env);

  if (token) {
    try {
      const verified = await client.verify(subjects as any, token);
      if (!verified.err) {
        const properties = (verified.subject as any).properties;
        return {
          userId: properties.id as string,
          email: properties.email as string,
          isLoggedIn: true,
          guestId: null,
          isNewGuest: false,
        };
      }
    } catch (error) {
      console.error("Token verification failed in optional check:", error);
    }
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
    };
  }

  // Handle guest fallback
  const guestMatch = cookieHeader.match(/guest_session=([^;]+)/);
  let guestId = guestMatch ? decodeURIComponent(guestMatch[1]) : null;
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
  };
}

export async function verifyBearerToken(request: Request, env: any) {
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

  const client = getAuthClient(request, env);

  if (token) {
    try {
      const verified = await client.verify(subjects as any, token);
      if (!verified.err) {
        const properties = (verified.subject as any).properties;
        return {
          userId: properties.id as string,
          email: properties.email as string,
          token,
        };
      }
    } catch {
      // Verification error
    }
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
