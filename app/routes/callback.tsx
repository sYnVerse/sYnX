import type { Route } from "./+types/callback";
import { redirect } from "react-router";
import { getAuthClient, getAuthSettings, parseSafeRedirectTo, verifyAccessToken } from "~/auth.server";
import { syncProviderProfile } from "~/provider-profile.server";
import {
  clearPkceCookie,
  parsePkceCookie,
  serializeAuthRefreshCookie,
  serializeAuthSessionCookie,
} from "~/auth-cookies.server";
import { getCloudflareContext } from "~/context.server";

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

    const safeDestination = parseSafeRedirectTo(destination);
    let targetLocation = "/";
    if (safeDestination && safeDestination !== "/") {
      targetLocation = `/?redirectTo=${encodeURIComponent(safeDestination)}`;
    }

    // Send the browser to / (which the mobile app has never claimed).
    // The web root route resolves the primary list and renders TodoPage directly,
    // avoiding Android App Links intercepting HTTP 302 redirects to /<uuid>.
    return redirect(targetLocation, { headers });
  } catch (error) {
    console.error("Callback handler error:", error);
    return reject();
  }
};
