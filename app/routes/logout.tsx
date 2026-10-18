import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthSettings } from "~/auth.server";
import { buildAuthClearCookieHeaders } from "~/auth-cookies.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const local = url.searchParams.get("local") === "true";
  const clearHeaders = buildAuthClearCookieHeaders(request.url);

  if (local) {
    return redirect("/", { headers: clearHeaders });
  }

  // Clear local session (and any leftover PKCE cookie) before central OpenAuth logout.
  const { clientID, issuer } = getAuthSettings(request, context.cloudflare.env);
  const redirectUri = url.origin + "/";
  const centralLogoutUrl = `${issuer}/logout?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return redirect(centralLogoutUrl, { headers: clearHeaders });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const local = url.searchParams.get("local") === "true";

  if (local) {
    return redirect("/", {
      headers: buildAuthClearCookieHeaders(request.url),
    });
  }

  return redirect("/");
};

export default function Logout() {
  return null;
}
