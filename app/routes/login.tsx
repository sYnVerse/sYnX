import type { Route } from "./+types/login";
import { redirect } from "react-router";
import { getAuthClient } from "~/auth.server";
import { serializePkceCookie } from "~/auth-cookies.server";
import { getCloudflareContext } from "~/context.server";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
  const client = getAuthClient(request, env);
  const callbackUrl = new URL(request.url).origin + "/callback";

  // PKCE S256 is required by sYnID (REQUIRE_PKCE). OpenAuth returns challenge.state + verifier.
  const { url, challenge } = await client.authorize(callbackUrl, "code", {
    pkce: true,
  });

  if (!challenge?.state || !challenge?.verifier) {
    console.error("OpenAuth authorize did not return a PKCE challenge");
    return redirect("/");
  }

  return redirect(url, {
    headers: {
      "Set-Cookie": serializePkceCookie(request.url, {
        state: challenge.state,
        verifier: challenge.verifier,
      }),
    },
  });
};

export default function Login() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <p>Redirecting to authentication server...</p>
    </div>
  );
}
