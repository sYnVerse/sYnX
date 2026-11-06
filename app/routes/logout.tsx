import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthSettings, isLocalTestAuthAllowed } from "~/auth.server";
import { planLogoutAction, planLogoutLoader } from "~/logout-policy.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const env = context.cloudflare.env;
  const { clientID, issuer } = getAuthSettings(request, env);
  const plan = planLogoutAction(request.url, {
    clientID,
    issuer,
    forceLocal: isLocalTestAuthAllowed(request, env),
  });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const plan = planLogoutLoader(request.url, {
    forceLocal: isLocalTestAuthAllowed(request, env),
  });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export default function Logout() {
  return null;
}
