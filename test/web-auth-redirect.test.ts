import { describe, it, expect, vi } from "vitest";
import {
  parseSafeRedirectTo,
  serializePkceCookie,
  parsePkceCookie,
  PKCE_COOKIE_NAME,
} from "../app/auth-cookies.server";
import {
  renderLandingHtml,
  renderLandingResponse,
} from "../app/auth-landing.server";
import { loader as callbackLoader } from "../app/routes/callback";
import { loader as indexLoader } from "../app/routes/_index";

describe("parseSafeRedirectTo", () => {
  it("allows safe relative paths", () => {
    expect(parseSafeRedirectTo("/")).toBe("/");
    expect(parseSafeRedirectTo("/3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b")).toBe(
      "/3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b",
    );
    expect(parseSafeRedirectTo("/tasks?status=completed")).toBe(
      "/tasks?status=completed",
    );
  });

  it("rejects open-redirect attempts and protocol-relative URLs", () => {
    expect(parseSafeRedirectTo("//evil.com")).toBeUndefined();
    expect(parseSafeRedirectTo("///evil.com")).toBeUndefined();
    expect(parseSafeRedirectTo("/\\evil.com")).toBeUndefined();
    expect(parseSafeRedirectTo("\\evil.com")).toBeUndefined();
    expect(parseSafeRedirectTo("https://evil.com")).toBeUndefined();
    expect(parseSafeRedirectTo("javascript:alert(1)")).toBeUndefined();
    expect(parseSafeRedirectTo(null)).toBeUndefined();
    expect(parseSafeRedirectTo("")).toBeUndefined();
  });

  it("rejects auth loops targeting login, logout, or callback", () => {
    expect(parseSafeRedirectTo("/login")).toBeUndefined();
    expect(parseSafeRedirectTo("/logout")).toBeUndefined();
    expect(parseSafeRedirectTo("/callback")).toBeUndefined();
    expect(parseSafeRedirectTo("/mobile/callback")).toBeUndefined();
    expect(parseSafeRedirectTo("/login?foo=bar")).toBeUndefined();
  });
});

describe("OAuth PKCE challenge cookie with redirectTo", () => {
  it("round-trips state, verifier, and safe redirectTo", () => {
    const cookie = serializePkceCookie("https://synx.christran.io/login", {
      state: "state-123",
      verifier: "verifier-456",
      redirectTo: "/custom-list-id",
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);
    const req = new Request("https://synx.christran.io/callback", {
      headers: { Cookie: `${PKCE_COOKIE_NAME}=${value}` },
    });
    const parsed = parsePkceCookie(req);

    expect(parsed).toEqual({
      state: "state-123",
      verifier: "verifier-456",
      redirectTo: "/custom-list-id",
    });
  });

  it("discards unsafe redirectTo when parsing PKCE cookie", () => {
    const payload = JSON.stringify({
      state: "state-123",
      verifier: "verifier-456",
      redirectTo: "//malicious.example.com/steal",
    });
    const req = new Request("https://synx.christran.io/callback", {
      headers: {
        Cookie: `${PKCE_COOKIE_NAME}=${encodeURIComponent(payload)}`,
      },
    });
    const parsed = parsePkceCookie(req);

    expect(parsed?.state).toBe("state-123");
    expect(parsed?.verifier).toBe("verifier-456");
    expect(parsed?.redirectTo).toBeUndefined();
  });
});

describe("renderLandingResponse", () => {
  it("returns HTTP 200 with text/html and client-side window.location.replace", async () => {
    const res = renderLandingResponse("/target-list");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");

    const text = await res.text();
    expect(text).toContain('window.location.replace("/target-list")');
    expect(text).toContain('content="0;url=/target-list"');
    expect(text).toContain("Finalizing sign-in...");
    expect(text).toContain('id="fallback-link"');
    expect(text).toContain("<noscript>");
  });

  it("verifies callback route module is a resource route without default UI export", async () => {
    const callbackModule = await import("../app/routes/callback");
    // In React Router v7, routes without a default component export are resource routes.
    // This ensures React Router directly sends the loader's Response instead of rendering a shell.
    expect((callbackModule as any).default).toBeUndefined();
  });

  it("escapes destination in HTML markup", () => {
    const html = renderLandingHtml('/path"onmouseover="alert(1)');
    expect(html).not.toContain('url=/path"onmouseover');
    expect(html).toContain("&quot;");
  });
});

describe("app/routes/callback loader behavior", () => {
  it("rejects when state or code is missing", async () => {
    const req = new Request("https://synx.christran.io/callback");
    const res = await callbackLoader({
      request: req,
      context: { cloudflare: { env: {} } },
      params: {},
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });

  it("rejects when PKCE cookie does not match state", async () => {
    const cookie = serializePkceCookie("https://synx.christran.io/login", {
      state: "state-original",
      verifier: "verifier-1",
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);
    const req = new Request("https://synx.christran.io/callback?code=abc&state=state-tampered", {
      headers: { Cookie: `${PKCE_COOKIE_NAME}=${value}` },
    });
    const res = await callbackLoader({
      request: req,
      context: { cloudflare: { env: {} } },
      params: {},
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });

  it("completes sign-in and returns HTTP 200 landing HTML when Accept: text/html", async () => {
    const authModule = await import("../app/auth.server");
    const providerModule = await import("../app/provider-profile.server");

    vi.spyOn(authModule, "getAuthClient").mockReturnValue({
      exchange: vi.fn().mockResolvedValue({
        tokens: { access: "access-token-123", refresh: "refresh-token-456" },
      }),
    } as any);
    vi.spyOn(authModule, "verifyAccessToken").mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
    });
    vi.spyOn(providerModule, "syncProviderProfile").mockResolvedValue();

    const targetListId = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: targetListId }),
        }),
      }),
    };

    const cookie = serializePkceCookie("https://synx.christran.io/login", {
      state: "state-ok",
      verifier: "verifier-ok",
      redirectTo: `/${targetListId}`,
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);

    const req = new Request("https://synx.christran.io/callback?code=auth-code&state=state-ok", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Cookie: `${PKCE_COOKIE_NAME}=${value}`,
      },
    });

    const res = await callbackLoader({
      request: req,
      context: { cloudflare: { env: { DB: mockDb } } },
      params: {},
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");

    // Session and refresh cookies are set
    const setCookieHeaders = res.headers.getSetCookie?.() || [];
    expect(setCookieHeaders.some((c) => c.includes("synx_auth_session"))).toBe(true);
    expect(setCookieHeaders.some((c) => c.includes("synx_refresh_session"))).toBe(true);
    expect(setCookieHeaders.some((c) => c.includes(`${PKCE_COOKIE_NAME}=;`))).toBe(true);

    const body = await res.text();
    // Landing document must perform client-side replace to avoid Android App Links intercept
    expect(body).toContain(`window.location.replace("/${targetListId}")`);
  });

  it("returns HTTP 302 redirect for programmatic callers without text/html", async () => {
    const authModule = await import("../app/auth.server");
    const providerModule = await import("../app/provider-profile.server");

    vi.spyOn(authModule, "getAuthClient").mockReturnValue({
      exchange: vi.fn().mockResolvedValue({
        tokens: { access: "access-token-123", refresh: "refresh-token-456" },
      }),
    } as any);
    vi.spyOn(authModule, "verifyAccessToken").mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
    });
    vi.spyOn(providerModule, "syncProviderProfile").mockResolvedValue();

    const targetListId = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
    const cookie = serializePkceCookie("https://synx.christran.io/login", {
      state: "state-ok-2",
      verifier: "verifier-ok-2",
      redirectTo: `/${targetListId}`,
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);

    const req = new Request("https://synx.christran.io/callback?code=auth-code&state=state-ok-2", {
      headers: {
        Accept: "application/json",
        Cookie: `${PKCE_COOKIE_NAME}=${value}`,
      },
    });

    const res = await callbackLoader({
      request: req,
      context: { cloudflare: { env: { DB: {} } } },
      params: {},
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/${targetListId}`);
  });
});

describe("app/routes/_index loader behavior", () => {
  it("redirects logged-in users to their first list via HTTP 302", async () => {
    const firstListId = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: firstListId }),
        }),
      }),
    };

    const req = new Request("http://localhost/", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        // Test token prefix
        Cookie: "synx_auth_session=e2e_test_session:user-1:user@example.com",
      },
    });

    const res = await indexLoader({
      request: req,
      context: {
        cloudflare: {
          env: {
            DB: mockDb,
            ALLOW_DEV_TEST_AUTH: "true",
          },
        },
      },
      params: {},
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/${firstListId}`);
  });

  it("returns HTTP 302 for non-HTML / programmatic callers", async () => {
    const firstListId = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: firstListId }),
        }),
      }),
    };

    const req = new Request("http://localhost/", {
      headers: {
        Accept: "application/json",
        Cookie: "synx_auth_session=e2e_test_session:user-1:user@example.com",
      },
    });

    const res = await indexLoader({
      request: req,
      context: {
        cloudflare: {
          env: {
            DB: mockDb,
            ALLOW_DEV_TEST_AUTH: "true",
          },
        },
      },
      params: {},
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/${firstListId}`);
  });
});
