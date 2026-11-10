import { describe, it, expect, vi } from "vitest";
import {
  parseSafeRedirectTo,
  serializePkceCookie,
  parsePkceCookie,
  PKCE_COOKIE_NAME,
} from "../app/auth-cookies.server";
import { loader as callbackLoader } from "../app/routes/callback";
import { loader as indexLoader } from "../app/routes/_index";
import { opensApp } from "./android-app-links.test";

describe("parseSafeRedirectTo", () => {
  it("allows safe relative paths", () => {
    expect(parseSafeRedirectTo("/")).toBe("/");
    expect(parseSafeRedirectTo("/3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b")).toBe(
      "/3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b",
    );
    expect(parseSafeRedirectTo("/list/3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b")).toBe(
      "/list/3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b",
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
      redirectTo: "/list/custom-list-id",
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);
    const req = new Request("https://synx.christran.io/callback", {
      headers: { Cookie: `${PKCE_COOKIE_NAME}=${value}` },
    });
    const parsed = parsePkceCookie(req);

    expect(parsed).toEqual({
      state: "state-123",
      verifier: "verifier-456",
      redirectTo: "/list/custom-list-id",
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

describe("app/routes/callback loader behavior (#196)", () => {
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

  it("completes sign-in and returns HTTP 302 redirect to / without landing screen", async () => {
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

    const cookie = serializePkceCookie("https://synx.christran.io/login", {
      state: "state-ok",
      verifier: "verifier-ok",
      // No specific redirectTo
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
      context: { cloudflare: { env: { DB: null } } },
      params: {},
    } as any);

    // Standard HTTP 302 redirect directly to /
    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toBe("/");

    // Contract test: destination must NOT open the mobile app
    const targetPath = new URL(location!, "https://synx.christran.io").pathname;
    expect(opensApp(targetPath)).toBe(false);

    // Session and refresh cookies are set
    const setCookieHeaders = res.headers.getSetCookie?.() || [];
    expect(setCookieHeaders.some((c) => c.includes("synx_auth_session"))).toBe(true);
    expect(setCookieHeaders.some((c) => c.includes("synx_refresh_session"))).toBe(true);
    expect(setCookieHeaders.some((c) => c.includes(`${PKCE_COOKIE_NAME}=;`))).toBe(true);
  });

  it("passes safe redirectTo as query param on / redirect", async () => {
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
      redirectTo: `/list/${targetListId}`,
    });
    const value = cookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);

    const req = new Request("https://synx.christran.io/callback?code=auth-code&state=state-ok-2", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Cookie: `${PKCE_COOKIE_NAME}=${value}`,
      },
    });

    const res = await callbackLoader({
      request: req,
      context: { cloudflare: { env: { DB: null } } },
      params: {},
    } as any);

    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toBe(`/?redirectTo=${encodeURIComponent(`/list/${targetListId}`)}`);

    // Contract test: destination pathname (/) must NOT open the mobile app
    const targetPath = new URL(location!, "https://synx.christran.io").pathname;
    expect(opensApp(targetPath)).toBe(false);
  });
});

describe("app/routes/_index loader behavior (#196)", () => {
  it("renders list data directly on / for logged-in users without issuing HTTP 302 redirect", async () => {
    const firstListId = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT id FROM lists WHERE owner_id = ?")) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: firstListId }),
            }),
          };
        }
        if (sql.includes("SELECT * FROM lists WHERE owner_id = ?")) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({
                results: [
                  {
                    id: firstListId,
                    name: "My Tasks",
                    owner_id: "user-1",
                    created_at: 1000,
                  },
                ],
              }),
            }),
          };
        }
        if (sql.includes("SELECT * FROM todos WHERE list_id = ?")) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({ results: [] }),
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      }),
    };

    const req = new Request("http://localhost/", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
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

    // Must NOT return an HTTP 302 redirect
    if (res instanceof Response) {
      expect(res.status).not.toBe(302);
      expect(res.headers.get("Location")).toBeNull();
    }
  });

  it("contract test: _index never redirects to a path claimed by Android App Links", async () => {
    const firstListId = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: firstListId }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    };

    const req = new Request("http://localhost/", {
      headers: {
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

    if (res instanceof Response && res.headers.has("Location")) {
      const loc = res.headers.get("Location")!;
      const pathname = new URL(loc, "http://localhost").pathname;
      expect(opensApp(pathname)).toBe(false);
    }
  });

  it("handles guest users on / by generating guest session and returning list data", async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    };

    const req = new Request("http://localhost/", {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const res = await indexLoader({
      request: req,
      context: {
        cloudflare: {
          env: {
            DB: mockDb,
          },
        },
      },
      params: {},
    } as any);

    // Guest response should not redirect to /<uuid>
    if (res instanceof Response) {
      expect(res.status).not.toBe(302);
      expect(res.headers.get("Location")).toBeNull();
    }
  });
});
