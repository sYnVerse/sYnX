import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSessionRefreshController,
  shouldSignOutAfterRefreshFailure,
  type SessionTokenStore,
  type RefreshResult,
} from "../shared/mobile-session";

function memoryStore(initial?: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): SessionTokenStore & {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const state = {
    accessToken: initial?.accessToken ?? null,
    refreshToken: initial?.refreshToken ?? null,
  };
  return {
    get accessToken() {
      return state.accessToken;
    },
    get refreshToken() {
      return state.refreshToken;
    },
    getAccessToken: async () => state.accessToken,
    getRefreshToken: async () => state.refreshToken,
    setAccessToken: async (token: string) => {
      state.accessToken = token;
    },
    setRefreshToken: async (token: string) => {
      state.refreshToken = token;
    },
    clearSessionTokens: async () => {
      state.accessToken = null;
      state.refreshToken = null;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("shouldSignOutAfterRefreshFailure", () => {
  it("signs out only for missing or rejected refresh tokens", () => {
    expect(shouldSignOutAfterRefreshFailure("no_refresh_token")).toBe(true);
    expect(shouldSignOutAfterRefreshFailure("invalid_grant")).toBe(true);
    expect(shouldSignOutAfterRefreshFailure("network")).toBe(false);
    expect(shouldSignOutAfterRefreshFailure("http_error")).toBe(false);
    expect(shouldSignOutAfterRefreshFailure("malformed_response")).toBe(false);
  });
});

describe("createSessionRefreshController", () => {
  const tokenEndpoint = "https://auth.example/token";
  const clientId = "synx";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("single-flights concurrent refresh calls into one token request", async () => {
    const store = memoryStore({
      accessToken: "old-access",
      refreshToken: "refresh-1",
    });
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return jsonResponse({
        access_token: "new-access",
        refresh_token: "refresh-2",
      });
    });

    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [a, b, c] = await Promise.all([
      controller.refresh(),
      controller.refresh(),
      controller.refresh(),
    ]);

    expect(calls).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.tokens.accessToken).toBe("new-access");
      expect(a.tokens.refreshToken).toBe("refresh-2");
    }
  });

  it("always replaces the stored refresh token when the issuer rotates it", async () => {
    const store = memoryStore({
      accessToken: "a1",
      refreshToken: "r1",
    });
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: async () =>
        jsonResponse({
          access_token: "a2",
          refresh_token: "r2-rotated",
        }),
    });

    const result = await controller.refresh();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rotatedRefreshToken).toBe(true);
      expect(result.tokens.refreshToken).toBe("r2-rotated");
    }
    expect(store.refreshToken).toBe("r2-rotated");
    expect(store.accessToken).toBe("a2");
  });

  it("keeps the existing refresh token when the response omits a new one", async () => {
    const store = memoryStore({
      accessToken: "a1",
      refreshToken: "r-keep",
    });
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: async () => jsonResponse({ access_token: "a2" }),
    });

    const result = await controller.refresh();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rotatedRefreshToken).toBe(false);
      expect(result.tokens.refreshToken).toBe("r-keep");
    }
    expect(store.refreshToken).toBe("r-keep");
  });

  it("treats invalid_grant as a sign-out failure", async () => {
    const store = memoryStore({
      accessToken: "a1",
      refreshToken: "dead-refresh",
    });
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: async () =>
        jsonResponse({ error: "invalid_grant", error_description: "reused" }, 400),
    });

    const result = await controller.refresh();
    expect(result).toEqual<RefreshResult>({
      ok: false,
      reason: "invalid_grant",
      status: 400,
    });
    expect(shouldSignOutAfterRefreshFailure(result.ok ? "network" : result.reason)).toBe(true);
    // Failed refresh must not wipe tokens by itself — caller decides logout.
    expect(store.refreshToken).toBe("dead-refresh");
    expect(store.accessToken).toBe("a1");
  });

  it("does not sign out on network failure", async () => {
    const store = memoryStore({
      accessToken: "a1",
      refreshToken: "r1",
    });
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: async () => {
        throw new TypeError("Network request failed");
      },
    });

    const result = await controller.refresh();
    expect(result).toEqual({ ok: false, reason: "network" });
    expect(shouldSignOutAfterRefreshFailure(result.ok ? "network" : result.reason)).toBe(false);
    expect(store.accessToken).toBe("a1");
    expect(store.refreshToken).toBe("r1");
  });

  it("returns no_refresh_token without calling the token endpoint", async () => {
    const store = memoryStore({ accessToken: "legacy-access-only", refreshToken: null });
    const fetchImpl = vi.fn();
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await controller.refresh();
    expect(result).toEqual({ ok: false, reason: "no_refresh_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(shouldSignOutAfterRefreshFailure("no_refresh_token")).toBe(true);
  });

  it("posts refresh_token grant with client_id", async () => {
    const store = memoryStore({ accessToken: "a1", refreshToken: "r1" });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe(tokenEndpoint);
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(body).toContain("grant_type=refresh_token");
      expect(body).toContain("client_id=synx");
      expect(body).toContain("refresh_token=r1");
      return jsonResponse({ access_token: "a2", refresh_token: "r2" });
    });

    const controller = createSessionRefreshController({
      store,
      tokenEndpoint,
      clientId,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await controller.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

/**
 * Simulates the Axios 401 path: refresh once (shared), then retry the original request.
 */
describe("401 refresh-then-retry flow", () => {
  it("retries the original request after a successful shared refresh", async () => {
    const store = memoryStore({ accessToken: "expired", refreshToken: "r1" });
    let tokenCalls = 0;
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint: "https://auth.example/token",
      clientId: "synx",
      fetchImpl: async () => {
        tokenCalls += 1;
        return jsonResponse({ access_token: "fresh", refresh_token: "r2" });
      },
    });

    const apiCalls: string[] = [];
    async function apiRequest(label: string): Promise<{ status: number; auth: string | null }> {
      const auth = await store.getAccessToken();
      apiCalls.push(`${label}:${auth}`);
      if (auth === "expired") {
        const refreshed = await controller.refresh();
        if (!refreshed.ok) {
          if (shouldSignOutAfterRefreshFailure(refreshed.reason)) {
            await store.clearSessionTokens();
          }
          return { status: 401, auth };
        }
        const retryAuth = await store.getAccessToken();
        apiCalls.push(`${label}-retry:${retryAuth}`);
        return { status: 200, auth: retryAuth };
      }
      return { status: 200, auth };
    }

    const [r1, r2] = await Promise.all([apiRequest("a"), apiRequest("b")]);
    expect(tokenCalls).toBe(1);
    expect(r1).toEqual({ status: 200, auth: "fresh" });
    expect(r2).toEqual({ status: 200, auth: "fresh" });
    expect(store.refreshToken).toBe("r2");
    expect(apiCalls.filter((c) => c.endsWith("-retry:fresh"))).toHaveLength(2);
  });

  it("clears the session when refresh fails with invalid_grant", async () => {
    const store = memoryStore({ accessToken: "expired", refreshToken: "r-dead" });
    const controller = createSessionRefreshController({
      store,
      tokenEndpoint: "https://auth.example/token",
      clientId: "synx",
      fetchImpl: async () => jsonResponse({ error: "invalid_grant" }, 400),
    });

    const refreshed = await controller.refresh();
    expect(refreshed.ok).toBe(false);
    if (!refreshed.ok && shouldSignOutAfterRefreshFailure(refreshed.reason)) {
      await store.clearSessionTokens();
    }
    expect(store.accessToken).toBeNull();
    expect(store.refreshToken).toBeNull();
  });
});
