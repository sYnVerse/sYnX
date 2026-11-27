import type { Route } from "./+types/logout";
import { redirect } from "react-router";
import { RouteErrorBoundary } from "~/components/RouteErrorBoundary";
import {
  getAuthSettings,
  isLocalTestAuthAllowed,
  isLocalTestToken,
  parseAuthSessionCookie,
  parseSessionIdCookie,
  verifyAccessToken,
  type AuthEnv,
} from "@synx/backend/services/auth.server";
import {
  revokeAuthSessionById,
  revokeAuthSessionForToken,
} from "@synx/backend/services/auth-sessions.server";
import { planLogoutAction, planLogoutLoader } from "@synx/backend/services/logout-policy.server";
import { getCloudflareContext } from "@synx/backend/services/context.server";

async function revokeLocalWebSession(
  request: Request,
  env: (AuthEnv & { DB?: D1Database }) | null | undefined,
): Promise<void> {
  if (!env?.DB) return;
  const sessionId = parseSessionIdCookie(request);
  const accessToken = parseAuthSessionCookie(request);

  if (accessToken && !isLocalTestToken(accessToken)) {
    try {
      const verified = await verifyAccessToken(request, env, accessToken);
      if (verified) {
        await revokeAuthSessionForToken(env.DB, {
          token: accessToken,
          userId: verified.userId,
          source: "web",
          sessionId,
          reason: "logout_local",
        });
        return;
      }
    } catch (err) {
      console.error("Failed to revoke web token on local logout:", err);
    }
  }

  if (sessionId) {
    try {
      await revokeAuthSessionById(env.DB, sessionId, "logout_local");
    } catch (err) {
      console.error("Failed to revoke web session by id on local logout:", err);
    }
  }
}

export const action = async ({ request, context }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { env } = getCloudflareContext(context);
  const { clientID, issuer } = getAuthSettings(request, env);
  const forceLocal = isLocalTestAuthAllowed(request, env);
  const url = new URL(request.url);
  if (url.searchParams.get("local") === "true" || forceLocal) {
    await revokeLocalWebSession(request, env);
  }
  const plan = planLogoutAction(request.url, {
    clientID,
    issuer,
    forceLocal,
  });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
  const forceLocal = isLocalTestAuthAllowed(request, env);
  const url = new URL(request.url);
  if (url.searchParams.get("local") === "true" || forceLocal) {
    await revokeLocalWebSession(request, env);
  }
  const plan = planLogoutLoader(request.url, { forceLocal });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export default function Logout() {
  return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorBoundary error={error} routeId="logout" preset="auth" />;
}
