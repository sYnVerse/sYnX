import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthClient, isLocalTestAuthAllowed, mintLocalTestToken } from "~/auth.server";
import { serializeAuthSessionCookie, serializePkceCookie } from "~/auth-cookies.server";
import { syncUserProfileOnSignIn } from "~/user-profile.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;

  if (isLocalTestAuthAllowed(request, env)) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get("Cookie") || "";
    const guestMatch = cookieHeader.match(/guest_session=([^;]+)/);
    const guestId = guestMatch ? decodeURIComponent(guestMatch[1]) : null;

    const rawUserId = url.searchParams.get("userId")?.trim();
    const userId = rawUserId || (guestId ? `user_${guestId}` : `user_e2e_${crypto.randomUUID().slice(0, 8)}`);
    const email = url.searchParams.get("email")?.trim() || `${userId}@e2e.local`;
    const displayName = url.searchParams.get("displayName")?.trim();
    const suggestedName = url.searchParams.get("suggestedName")?.trim();
    const redirectToRaw = url.searchParams.get("redirectTo")?.trim();
    const redirectTo =
      redirectToRaw && redirectToRaw.startsWith("/") && !redirectToRaw.startsWith("//")
        ? redirectToRaw
        : "/";

    const db = env.DB;
    if (db) {
      try {
        await syncUserProfileOnSignIn(db, userId, email);
        if (displayName) {
          await db
            .prepare(
              `INSERT INTO user_settings (user_id, email, display_name)
               VALUES (?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`,
            )
            .bind(userId, email, displayName)
            .run();
        }
        if (suggestedName) {
          await db
            .prepare(
              `INSERT INTO user_settings (user_id, email, suggested_display_name, display_name_suggestion_dismissed)
               VALUES (?, ?, ?, 0)
               ON CONFLICT(user_id) DO UPDATE SET
                 email = excluded.email,
                 suggested_display_name = excluded.suggested_display_name,
                 display_name_suggestion_dismissed = 0`,
            )
            .bind(userId, email, suggestedName)
            .run();
        }
      } catch (e) {
        console.error("Local test auth user sync failed:", e);
      }
    }

    const token = mintLocalTestToken({ userId, email });
    const headers = new Headers();
    headers.append("Set-Cookie", serializeAuthSessionCookie(request.url, token));
    return redirect(redirectTo, { headers });
  }

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
