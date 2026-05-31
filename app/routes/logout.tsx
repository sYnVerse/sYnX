import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getCookieAttributes, getAuthSettings } from "~/auth.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const local = url.searchParams.get("local") === "true";

  if (local) {
    return redirect("/", {
      headers: {
        "Set-Cookie": `synx_auth_session=; ${getCookieAttributes(request.url, 0)}`,
      },
    });
  }

  // Redirect to central openauth logout page
  const { clientID, issuer } = getAuthSettings(request, context.cloudflare.env);
  const redirectUri = url.origin + "/";
  const centralLogoutUrl = `${issuer}/logout?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return redirect(centralLogoutUrl);
};

export default function Logout() {
  return null;
}
