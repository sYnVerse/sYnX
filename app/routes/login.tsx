import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthClient, parseTestLoginRequest } from "~/auth.server";
import { serializeAuthSessionCookie, serializePkceCookie } from "~/auth-cookies.server";
import { syncUserProfileOnSignIn } from "~/user-profile.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;

  const testLogin = parseTestLoginRequest(request, env);
  if (testLogin.allowed) {
    if (testLogin.error) {
      return new Response(testLogin.error.message, { status: testLogin.error.status });
    }
    if (testLogin.session) {
      const { userId, email, displayName, suggestedName, redirectTo, token } = testLogin.session;
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

      const headers = new Headers();
      headers.append("Set-Cookie", serializeAuthSessionCookie(request.url, token));
      return redirect(redirectTo, { headers });
    }
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
