import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthClient, getCookieAttributes } from "~/auth.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return redirect("/login");
  }

  const client = getAuthClient(request, context.cloudflare.env);
  const callbackUrl = url.origin + "/callback";

  try {
    const exchanged = await client.exchange(code, callbackUrl);
    if (exchanged.err) {
      console.error("Token exchange failed:", exchanged.err);
      return redirect("/login");
    }

    const { access } = exchanged.tokens;
    const domain = getCookieAttributes(request.url, 2592000);

    // Set the cookie with the access token
    return redirect("/", {
      headers: {
        "Set-Cookie": `todo_auth_session=${encodeURIComponent(access)}; ${domain}`, // 30 days
      },
    });
  } catch (error) {
    console.error("Callback handler error:", error);
    return redirect("/login");
  }
};

export default function Callback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <p>Finalizing authentication flow...</p>
    </div>
  );
}
