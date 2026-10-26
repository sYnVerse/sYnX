import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthClient, verifyAccessToken } from "~/auth.server";
import {
  clearPkceCookie,
  parsePkceCookie,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
} from "~/auth-cookies.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const clearPkce = clearPkceCookie(request.url);

  const reject = () =>
    redirect("/login", {
      headers: {
        "Set-Cookie": clearPkce,
      },
    });

  if (!code || !state) {
    return reject();
  }

  const challenge = parsePkceCookie(request);
  if (!challenge || challenge.state !== state || !challenge.verifier) {
    console.error("OAuth callback rejected: missing or mismatched PKCE state/verifier");
    return reject();
  }

  const client = getAuthClient(request, context.cloudflare.env);
  const callbackUrl = url.origin + "/callback";

  try {
    const exchanged = await client.exchange(code, callbackUrl, challenge.verifier);
    if (exchanged.err) {
      console.error("Token exchange failed:", exchanged.err);
      return reject();
    }

    const { access, refresh } = exchanged.tokens;
    // Only store a session that sYnX itself will accept (valid and issued to sYnX).
    if (!(await verifyAccessToken(request, context.cloudflare.env, access))) {
      console.error("Token exchange returned an access token sYnX does not accept");
      return reject();
    }
    const headers = new Headers();
    // Always clear the short-lived PKCE cookie after a successful exchange.
    headers.append("Set-Cookie", clearPkce);
    headers.append("Set-Cookie", serializeAuthSessionCookie(request.url, access));
    if (refresh) {
      headers.append("Set-Cookie", serializeAuthRefreshCookie(request.url, refresh));
    }

    return redirect("/", { headers });
  } catch (error) {
    console.error("Callback handler error:", error);
    return reject();
  }
};

export default function Callback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <p>Finalizing authentication flow...</p>
    </div>
  );
}
