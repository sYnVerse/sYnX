import { describe, it, expect } from "vitest";
import {
  AUTH_SESSION_COOKIE,
  PKCE_COOKIE_NAME,
  PKCE_MAX_AGE_SECONDS,
  buildAuthClearCookieHeaders,
  clearAuthSessionCookie,
  clearPkceCookie,
  getPkceCookieAttributes,
  parsePkceCookie,
  serializePkceCookie,
} from "../app/auth-cookies.server";

describe("OAuth PKCE BFF cookie helpers", () => {
  it("serializes a host-only HttpOnly SameSite=Lax PKCE cookie with 5-minute Max-Age", () => {
    const setCookie = serializePkceCookie("https://synx.christran.io/login", {
      state: "state-abc",
      verifier: "verifier-xyz",
    });

    expect(setCookie.startsWith(`${PKCE_COOKIE_NAME}=`)).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain(`Max-Age=${PKCE_MAX_AGE_SECONDS}`);
    expect(setCookie).toContain("Path=/");
    // Host-only: must NOT share Domain=.christran.io (session cookie does).
    expect(setCookie).not.toContain("Domain=");
  });

  it("omits Secure on http localhost for local dev", () => {
    const attrs = getPkceCookieAttributes("http://127.0.0.1:5173/login");
    expect(attrs).toContain("HttpOnly");
    expect(attrs).toContain("SameSite=Lax");
    expect(attrs).not.toContain("Secure");
  });

  it("round-trips state + verifier through Cookie header parsing", () => {
    const setCookie = serializePkceCookie("http://localhost:5173/login", {
      state: "st-1",
      verifier: "ver-1",
    });
    const value = setCookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);
    const request = new Request("http://localhost:5173/callback?code=abc&state=st-1", {
      headers: { Cookie: `${PKCE_COOKIE_NAME}=${value}` },
    });

    expect(parsePkceCookie(request)).toEqual({ state: "st-1", verifier: "ver-1" });
  });

  it("returns null for missing, malformed, or incomplete PKCE cookies", () => {
    expect(parsePkceCookie(new Request("http://localhost/callback"))).toBeNull();
    expect(
      parsePkceCookie(
        new Request("http://localhost/callback", {
          headers: { Cookie: `${PKCE_COOKIE_NAME}=not-json` },
        }),
      ),
    ).toBeNull();
    expect(
      parsePkceCookie(
        new Request("http://localhost/callback", {
          headers: {
            Cookie: `${PKCE_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ state: "only" }))}`,
          },
        }),
      ),
    ).toBeNull();
  });

  it("clears both session and PKCE cookies on logout helper", () => {
    const headers = buildAuthClearCookieHeaders("https://synx.christran.io/");
    const cookies = headers.getSetCookie?.() ?? [];
    // Workers/undici Headers may expose getSetCookie; fall back to iterating.
    const all =
      cookies.length > 0
        ? cookies
        : [...headers.entries()].filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => v);

    expect(all.some((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`))).toBe(true);
    expect(all.some((c) => c.startsWith(`${PKCE_COOKIE_NAME}=;`))).toBe(true);
    expect(clearAuthSessionCookie("https://synx.christran.io/")).toContain("Domain=.christran.io");
    expect(clearPkceCookie("https://synx.christran.io/")).not.toContain("Domain=");
  });
});

describe("OAuth callback state gate (logic)", () => {
  it("rejects when callback state does not match cookie state", () => {
    const cookie = serializePkceCookie("http://127.0.0.1:5173/login", {
      state: "expected-state",
      verifier: "verifier",
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);
    const request = new Request(
      "http://127.0.0.1:5173/callback?code=authcode&state=wrong-state",
      { headers: { Cookie: `${PKCE_COOKIE_NAME}=${value}` } },
    );
    const challenge = parsePkceCookie(request);
    const state = new URL(request.url).searchParams.get("state");
    expect(challenge).not.toBeNull();
    expect(state).not.toBe(challenge!.state);
  });

  it("accepts matching state and exposes verifier for token exchange", () => {
    const cookie = serializePkceCookie("http://127.0.0.1:5173/login", {
      state: "expected-state",
      verifier: "pkce-verifier-value",
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);
    const request = new Request(
      "http://127.0.0.1:5173/callback?code=authcode&state=expected-state",
      { headers: { Cookie: `${PKCE_COOKIE_NAME}=${value}` } },
    );
    const challenge = parsePkceCookie(request);
    const state = new URL(request.url).searchParams.get("state");
    expect(challenge?.state).toBe(state);
    expect(challenge?.verifier).toBe("pkce-verifier-value");
  });
});
