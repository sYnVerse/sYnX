import { createClient } from "@openauthjs/openauth/client";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { redirect } from "@remix-run/cloudflare";
import {
  AUTH_SESSION_COOKIE,
  clearAuthSessionCookie,
} from "./auth-cookies.server";

export {
  AUTH_SESSION_COOKIE,
  PKCE_COOKIE_NAME,
  PKCE_MAX_AGE_SECONDS,
  buildAuthClearCookieHeaders,
  clearAuthSessionCookie,
  clearPkceCookie,
  getCookieAttributes,
  getCookieDomain,
  getPkceCookieAttributes,
  parsePkceCookie,
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

export async function requireUser(request: Request, env: any) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token) {
    throw redirect("/login");
  }

  const client = getAuthClient(request, env);
  try {
    const verified = await client.verify(subjects as any, token);
    if (verified.err) {
      throw redirect("/login", {
        headers: {
          "Set-Cookie": clearAuthSessionCookie(request.url),
        },
      });
    }
    const properties = (verified.subject as any).properties;
    return {
      userId: properties.id as string,
      email: properties.email as string,
      token,
    };
  } catch (error) {
    console.error("Token verification failed:", error);
    // Clear cookie and redirect to login
    throw redirect("/login", {
      headers: {
        "Set-Cookie": clearAuthSessionCookie(request.url),
      },
    });
  }
}

export async function getOptionalUser(request: Request, env: any) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  if (token) {
    const client = getAuthClient(request, env);
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
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    const cookieHeader = request.headers.get("Cookie") || "";
    const match = cookieHeader.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`));
    token = match ? decodeURIComponent(match[1]) : null;
  }

  if (!token) return null;

  const client = getAuthClient(request, env);
  try {
    const verified = await client.verify(subjects as any, token);
    if (verified.err) return null;
    const properties = (verified.subject as any).properties;
    return {
      userId: properties.id as string,
      email: properties.email as string,
      token,
    };
  } catch (error) {
    console.error("Bearer token verification error:", error);
    return null;
  }
}
