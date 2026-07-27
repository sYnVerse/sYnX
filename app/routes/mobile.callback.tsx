import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";

/**
 * Mobile OAuth redirect target for App Links / PKCE.
 * Intentionally does NOT exchange the authorization code — the Expo app
 * completes the token exchange client-side with its code_verifier.
 */
export const meta: MetaFunction = () => [
  { name: "referrer", content: "no-referrer" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const hasCode = Boolean(url.searchParams.get("code"));

  // Never log the full URL (may contain the auth code).
  console.log(`[mobile/callback] Pass-through hit; code present: ${hasCode}`);

  return json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    }
  );
}

export default function MobileCallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 px-6 text-center gap-3">
      <h1 className="text-xl font-semibold text-slate-100">sYnX</h1>
      <p className="text-slate-400 text-sm max-w-sm">
        Sign-in handoff complete. You can return to the sYnX Android app.
        If the app did not open automatically, switch back to it manually.
      </p>
    </div>
  );
}
