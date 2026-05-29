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

export function getAuthClient(request: Request, env: any) {
  const issuer = env.OPENAUTH_ISSUER || "https://auth.christran.io";
  return createClient({
    clientID: "to-do-list",
    issuer,
  });
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
