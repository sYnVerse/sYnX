import type { Route } from "./+types/callback";
import { redirect } from "react-router";
import { getAuthClient, getAuthSettings, verifyAccessToken } from "~/auth.server";
import { syncProviderProfile } from "~/provider-profile.server";
import {
  clearPkceCookie,
  parsePkceCookie,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
} from "~/auth-cookies.server";
import { getCloudflareContext } from "~/context.server";
import { renderLandingResponse } from "~/auth-landing.server";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
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

  const client = getAuthClient(request, env);
  const callbackUrl = url.origin + "/callback";

  try {
    const exchanged = await client.exchange(code, callbackUrl, challenge.verifier);
    if (exchanged.err) {
      console.error("Token exchange failed:", exchanged.err);
      return reject();
    }

    const { access, refresh } = exchanged.tokens;
    // Only store a session that sYnX itself will accept (valid and issued to sYnX).
    const verified = await verifyAccessToken(request, env, access);
    if (!verified) {
      console.error("Token exchange returned an access token sYnX does not accept");
      return reject();
    }
    // Pick up the provider photo / suggested name right after sign-in. Best-effort
    // and time-limited: a slow, failing or missing sYnID /userinfo never blocks sign-in.
    await syncProviderProfile(env.DB, {
      userId: verified.userId,
      email: verified.email,
      accessToken: access,
      issuer: getAuthSettings(request, env).issuer,
      force: true,
    });
    const headers = new Headers();
    // Always clear the short-lived PKCE cookie after a successful exchange.
    headers.append("Set-Cookie", clearPkce);
    headers.append("Set-Cookie", serializeAuthSessionCookie(request.url, access));
    if (refresh) {
      headers.append("Set-Cookie", serializeAuthRefreshCookie(request.url, refresh));
    }

    // Determine return destination
    let destination = challenge.redirectTo;
    // Guest list paths (/guest_...) were temporary in local storage; after sign-in,
    // they migrate to the user's primary/owned lists, so resolve to the owned list.
    if (destination?.startsWith("/guest_")) {
      destination = undefined;
    }

    if (!destination || destination === "/") {
      if (env.DB) {
        try {
          let firstList = await env.DB.prepare(
            "SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1",
          )
            .bind(verified.userId)
            .first<{ id: string }>();
          if (!firstList) {
            const defaultListId = crypto.randomUUID();
            await env.DB.prepare(
              "INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)",
            )
              .bind(defaultListId, "My Tasks", verified.userId, Date.now(), null)
              .run();
            firstList = { id: defaultListId };
          }
          if (firstList?.id) {
            destination = `/${firstList.id}`;
          }
        } catch (e) {
          console.error("Failed to query or create default list in callback:", e);
        }
      }
      if (!destination || destination === "/") {
        destination = `/${verified.userId}`;
      }
    }

    const acceptHeader = request.headers.get("Accept") || "";
    // When loaded in a browser (Accept: text/html), return an HTML document with client-side
    // same-origin window.location.replace navigation. This ends the external OAuth redirect
    // chain and commits the session on synx.christran.io, avoiding Android App Links
    // intercepting HTTP 302 redirects to list UUIDs and launching the mobile app.
    if (acceptHeader.includes("text/html")) {
      return renderLandingResponse(destination, headers);
    }

    return redirect(destination, { headers });
  } catch (error) {
    console.error("Callback handler error:", error);
    return reject();
  }
};

export default function Callback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <div className="w-9 h-9 border-3 border-slate-700 border-t-indigo-500 rounded-full animate-spin mb-4" />
      <p className="text-slate-400 text-sm">Finalizing sign-in...</p>
    </div>
  );
}
