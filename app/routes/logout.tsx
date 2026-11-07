import type { Route } from "./+types/logout";
import { redirect } from "react-router";
import { getAuthSettings, isLocalTestAuthAllowed } from "~/auth.server";
import { planLogoutAction, planLogoutLoader } from "~/logout-policy.server";
import { getCloudflareContext } from "~/context.server";

export const action = async ({ request, context }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { env } = getCloudflareContext(context);
  const { clientID, issuer } = getAuthSettings(request, env);
  const plan = planLogoutAction(request.url, {
    clientID,
    issuer,
    forceLocal: isLocalTestAuthAllowed(request, env),
  });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
  const plan = planLogoutLoader(request.url, {
    forceLocal: isLocalTestAuthAllowed(request, env),
  });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export default function Logout() {
  return null;
}
