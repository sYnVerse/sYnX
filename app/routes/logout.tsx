import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthSettings } from "~/auth.server";
import { planLogoutAction, planLogoutLoader } from "~/logout-policy.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { clientID, issuer } = getAuthSettings(request, context.cloudflare.env);
  const plan = planLogoutAction(request.url, { clientID, issuer });
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const plan = planLogoutLoader(request.url);
  return redirect(plan.location, plan.headers ? { headers: plan.headers } : undefined);
};

export default function Logout() {
  return null;
}
