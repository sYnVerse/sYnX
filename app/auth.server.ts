import { createClient } from "@openauthjs/openauth/client";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { redirect } from "@remix-run/cloudflare";

export const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
  }) as any,
});

let clientCache: ReturnType<typeof createClient> | null = null;

export function getAuthClient(request: Request, env: any) {
  if (!clientCache) {
    const issuer = env.OPENAUTH_ISSUER || "https://auth.christran.io";
    clientCache = createClient({
      clientID: "to-do-list",
      issuer,
    });
  }
  return clientCache;
}

export async function requireUser(request: Request, env: any) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_session=([^;]+)/);
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
          "Set-Cookie": "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
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
        "Set-Cookie": "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  }
}

export async function getOptionalUser(request: Request, env: any) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_session=([^;]+)/);
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
