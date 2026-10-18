import {
  buildAuthClearCookieHeaders,
  buildCentralLogoutClearHeaders,
} from "./auth-cookies.server";

export type LogoutPlan = {
  location: string;
  headers: Headers | null;
};

/**
 * Pure logout routing policy (no Remix imports) so unit tests can assert
 * cookie clearing and redirect targets without loading @remix-run/cloudflare.
 */
export function planLogoutAction(
  requestUrl: string,
  opts: { clientID: string; issuer: string },
): LogoutPlan {
  const url = new URL(requestUrl);
  const local = url.searchParams.get("local") === "true";

  if (local) {
    return {
      location: "/",
      headers: buildAuthClearCookieHeaders(requestUrl),
    };
  }

  const redirectUri = url.origin + "/";
  const centralLogoutUrl = `${opts.issuer}/logout?client_id=${opts.clientID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return {
    location: centralLogoutUrl,
    headers: buildCentralLogoutClearHeaders(requestUrl),
  };
}

export function planLogoutLoader(requestUrl: string): LogoutPlan {
  const url = new URL(requestUrl);
  const local = url.searchParams.get("local") === "true";

  if (local) {
    return {
      location: "/",
      headers: buildAuthClearCookieHeaders(requestUrl),
    };
  }

  return { location: "/", headers: null };
}
