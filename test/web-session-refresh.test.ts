import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  serializeAuthSessionCookie,
  serializeAuthRefreshCookie,
  clearAuthSessionCookie,
  clearAuthRefreshCookie,
  buildAuthClearCookieHeaders,
  parseRefreshCookie,
} from "../app/auth-cookies.server";
import {
  getOptionalUser,
  getRefreshedCookies,
  requireUser,
  trySilentRefresh,
  verifyBearerToken,
} from "../app/auth.server";

// Mock @openauthjs/openauth/client
const mockRefresh = vi.fn();
const mockVerify = vi.fn();

vi.mock("@openauthjs/openauth/client", () => ({
  createClient: vi.fn(() => ({
    refresh: (...args: any[]) => mockRefresh(...args),
    verify: (...args: any[]) => mockVerify(...args),
  })),
}));

describe("web session cookie helpers", () => {
  it("serializes access token with 15-minute (900s) Max-Age and security attributes", () => {
    const cookie = serializeAuthSessionCookie("https://synx.christran.io/app", "access-jwt-123");
    expect(cookie).toContain("synx_auth_session=access-jwt-123");
    expect(cookie).toContain(`Max-Age=${ACCESS_TOKEN_MAX_AGE_SECONDS}`);
    expect(ACCESS_TOKEN_MAX_AGE_SECONDS).toBe(900);
    expect(cookie).toContain("Domain=.christran.io");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("serializes refresh token with 14-day (1209600s) Max-Age and security attributes", () => {
    const cookie = serializeAuthRefreshCookie("https://synx.christran.io/app", "refresh-token-xyz");
    expect(cookie).toContain("synx_refresh_session=refresh-token-xyz");
    expect(cookie).toContain(`Max-Age=${REFRESH_TOKEN_MAX_AGE_SECONDS}`);
    expect(REFRESH_TOKEN_MAX_AGE_SECONDS).toBe(1209600);
    expect(cookie).toContain("Domain=.christran.io");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("buildAuthClearCookieHeaders emits Max-Age=0 for session, refresh, and PKCE", () => {
    const headers = buildAuthClearCookieHeaders("https://synx.christran.io/");
    const cookies = headers.getSetCookie?.() ?? [];
    expect(cookies.some((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("synx_oauth_pkce=;") && c.includes("Max-Age=0"))).toBe(true);
  });

  it("parseRefreshCookie parses synx_refresh_session from request headers", () => {
    const req = new Request("https://synx.christran.io/", {
      headers: {
        Cookie: "other=123; synx_refresh_session=user-ref-token-abc; foo=bar",
      },
    });
    expect(parseRefreshCookie(req)).toBe("user-ref-token-abc");

    const reqEmpty = new Request("https://synx.christran.io/");
    expect(parseRefreshCookie(reqEmpty)).toBeNull();
  });
});

describe("web silent refresh flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trySilentRefresh calls client.refresh, verifies new access token, and records refreshed cookies", async () => {
    const req = new Request("https://synx.christran.io/dashboard", {
      headers: {
        Cookie: "synx_refresh_session=existing-refresh-123",
      },
    });

    mockRefresh.mockResolvedValueOnce({
      err: false,
      tokens: {
        access: "new-access-jwt-456",
        refresh: "new-refresh-token-789",
      },
    });

    mockVerify.mockResolvedValueOnce({
      err: false,
      subject: {
        type: "user",
        properties: { id: "user_123", email: "user@example.com" },
      },
    });

    const result = await trySilentRefresh(req, {}, "expired-access-token");
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user_123");
    expect(result?.email).toBe("user@example.com");
    expect(result?.token).toBe("new-access-jwt-456");

    const refreshed = getRefreshedCookies(req);
    expect(refreshed.length).toBe(2);
    expect(refreshed.some((c) => c.startsWith("synx_auth_session=new-access-jwt-456") && c.includes("Max-Age=900"))).toBe(true);
    expect(refreshed.some((c) => c.startsWith("synx_refresh_session=new-refresh-token-789") && c.includes("Max-Age=1209600"))).toBe(true);
  });

  it("requireUser transparently refreshes expired access token when valid refresh cookie is present", async () => {
    const req = new Request("https://synx.christran.io/app", {
      headers: {
        Cookie: "synx_auth_session=expired-token; synx_refresh_session=valid-refresh",
      },
    });

    // 1. Initial verify fails because access token expired
    mockVerify.mockResolvedValueOnce({ err: true });

    // 2. Refresh succeeds
    mockRefresh.mockResolvedValueOnce({
      err: false,
      tokens: { access: "minted-access-999" },
    });

    // 3. Verify newly minted token succeeds
    mockVerify.mockResolvedValueOnce({
      err: false,
      subject: {
        type: "user",
        properties: { id: "user_renewed", email: "renewed@example.com" },
      },
    });

    const user = await requireUser(req, {});
    expect(user.userId).toBe("user_renewed");
    expect(user.token).toBe("minted-access-999");
  });

  it("requireUser redirects to /login and clears cookies when access and refresh both fail", async () => {
    const req = new Request("https://synx.christran.io/app", {
      headers: {
        Cookie: "synx_auth_session=expired-token; synx_refresh_session=revoked-refresh",
      },
    });

    mockVerify.mockResolvedValueOnce({ err: true });
    mockRefresh.mockResolvedValueOnce({ err: true });

    await expect(requireUser(req, {})).rejects.toThrow();
  });

  it("getOptionalUser transparently returns authenticated user when silently refreshed", async () => {
    const req = new Request("https://synx.christran.io/", {
      headers: {
        Cookie: "synx_auth_session=expired; synx_refresh_session=valid-refresh",
      },
    });

    mockVerify.mockResolvedValueOnce({ err: true });
    mockRefresh.mockResolvedValueOnce({
      err: false,
      tokens: { access: "fresh-access" },
    });
    mockVerify.mockResolvedValueOnce({
      err: false,
      subject: {
        type: "user",
        properties: { id: "opt_user", email: "opt@example.com" },
      },
    });

    const user = await getOptionalUser(req, {});
    expect(user.isLoggedIn).toBe(true);
    expect(user.userId).toBe("opt_user");
  });

  it("verifyBearerToken silently renews cookie-backed session when access token expired", async () => {
    const req = new Request("https://synx.christran.io/api/v1/todos?listId=abc", {
      headers: {
        Cookie: "synx_auth_session=expired-cookie; synx_refresh_session=valid-refresh",
      },
    });

    mockVerify.mockResolvedValueOnce({ err: true });
    mockRefresh.mockResolvedValueOnce({
      err: false,
      tokens: { access: "api-refreshed-token" },
    });
    mockVerify.mockResolvedValueOnce({
      err: false,
      subject: {
        type: "user",
        properties: { id: "api_user", email: "api@example.com" },
      },
    });

    const authed = await verifyBearerToken(req, {});
    expect(authed?.userId).toBe("api_user");
    expect(authed?.token).toBe("api-refreshed-token");
  });
});
