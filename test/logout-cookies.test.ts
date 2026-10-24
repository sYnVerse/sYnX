import { describe, it, expect } from "vitest";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  PKCE_COOKIE_NAME,
  clearAuthRefreshCookie,
  clearAuthSessionCookie,
  clearPkceCookie,
} from "../app/auth-cookies.server";
import { planLogoutAction, planLogoutLoader } from "../app/logout-policy.server";

function setCookieValues(headers: Headers | null): string[] {
  if (!headers) return [];
  const viaGetSetCookie = headers.getSetCookie?.() ?? [];
  if (viaGetSetCookie.length > 0) return viaGetSetCookie;
  return [...headers.entries()]
    .filter(([k]) => k.toLowerCase() === "set-cookie")
    .map(([, v]) => v);
}

describe("logout cookie clearing policy", () => {
  it("non-local POST clears PKCE only, keeps session/refresh cookies, redirects to central logout", () => {
    const plan = planLogoutAction("https://synx.christran.io/logout", {
      clientID: "synx",
      issuer: "https://auth.christran.io",
    });

    expect(plan.location.startsWith("https://auth.christran.io/logout?")).toBe(true);
    expect(plan.location).toContain("client_id=synx");
    expect(plan.location).toContain(
      `redirect_uri=${encodeURIComponent("https://synx.christran.io/")}`,
    );

    const cookies = setCookieValues(plan.headers);
    expect(cookies.some((c) => c.startsWith(`${PKCE_COOKIE_NAME}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=`))).toBe(false);
    expect(cookies.some((c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=`))).toBe(false);

    const pkce = cookies.find((c) => c.startsWith(`${PKCE_COOKIE_NAME}=;`))!;
    expect(pkce).toContain("Path=/");
    expect(pkce).toContain("HttpOnly");
    expect(pkce).toContain("SameSite=Lax");
    expect(pkce).toContain("Secure");
    expect(pkce).not.toContain("Domain=");
  });

  it("local=true POST clears session, refresh, and PKCE with Domain=.christran.io", () => {
    const plan = planLogoutAction("https://synx.christran.io/logout?local=true", {
      clientID: "synx",
      issuer: "https://auth.christran.io",
    });

    expect(plan.location).toBe("/");
    const cookies = setCookieValues(plan.headers);
    expect(cookies.some((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${PKCE_COOKIE_NAME}=;`))).toBe(true);

    const session = cookies.find((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`))!;
    expect(session).toContain("Domain=.christran.io");
    expect(session).toContain("Path=/");
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(session).toContain("Secure");
    expect(session).toContain("Max-Age=0");

    const refresh = cookies.find((c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=;`))!;
    expect(refresh).toContain("Domain=.christran.io");
    expect(refresh).toContain("Max-Age=0");

    // Explicit attribute helpers stay aligned with what sYnID clears.
    expect(clearAuthSessionCookie("https://synx.christran.io/")).toContain("Domain=.christran.io");
    expect(clearAuthRefreshCookie("https://synx.christran.io/")).toContain("Domain=.christran.io");
    expect(clearPkceCookie("https://synx.christran.io/")).not.toContain("Domain=");
  });

  it("local=true GET loader clears session, refresh, and PKCE and redirects home", () => {
    const plan = planLogoutLoader("https://synx.christran.io/logout?local=true");
    expect(plan.location).toBe("/");
    const cookies = setCookieValues(plan.headers);
    expect(cookies.some((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${PKCE_COOKIE_NAME}=;`))).toBe(true);
    const session = cookies.find((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`))!;
    expect(session).toContain("Domain=.christran.io");
  });

  it("non-local GET loader redirects home without clearing session", () => {
    const plan = planLogoutLoader("https://synx.christran.io/logout");
    expect(plan.location).toBe("/");
    expect(plan.headers).toBeNull();
  });
});
