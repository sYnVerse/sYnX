/**
 * Mobile OAuth session helpers (access + refresh tokens).
 * Pure logic — storage and fetch are injected so vitest can cover refresh behavior.
 */

export const MOBILE_ACCESS_TOKEN_KEY = "synx_access_token";
export const MOBILE_REFRESH_TOKEN_KEY = "synx_refresh_token";

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
};

export type SessionTokenStore = {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setAccessToken(token: string): Promise<void>;
  setRefreshToken(token: string): Promise<void>;
  clearSessionTokens(): Promise<void>;
};

export type RefreshFailureReason =
  | "no_refresh_token"
  | "invalid_grant"
  | "http_error"
  | "network"
  | "malformed_response";

export type RefreshResult =
  | { ok: true; tokens: TokenSet; rotatedRefreshToken: boolean }
  | { ok: false; reason: RefreshFailureReason; status?: number };

export type SessionRefreshController = {
  refresh: () => Promise<RefreshResult>;
  /** Test/helper: whether a refresh is currently in flight. */
  isRefreshing: () => boolean;
};

/**
 * Sign the user out only when the refresh token is missing or the issuer
 * rejected it (invalid / expired / reused). Transient network or 5xx must not.
 */
export function shouldSignOutAfterRefreshFailure(reason: RefreshFailureReason): boolean {
  return reason === "no_refresh_token" || reason === "invalid_grant";
}

function parseTokenError(data: unknown, status: number): RefreshFailureReason {
  const err =
    data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : "";
  if (
    status === 400 ||
    status === 401 ||
    err === "invalid_grant" ||
    err === "invalid_token" ||
    err === "expired_token"
  ) {
    return "invalid_grant";
  }
  return "http_error";
}

export function createSessionRefreshController(options: {
  store: SessionTokenStore;
  tokenEndpoint: string;
  clientId: string;
  fetchImpl?: typeof fetch;
}): SessionRefreshController {
  let inflight: Promise<RefreshResult> | null = null;

  async function performRefresh(): Promise<RefreshResult> {
    const refreshToken = await options.store.getRefreshToken();
    if (!refreshToken) {
      return { ok: false, reason: "no_refresh_token" };
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await fetchImpl(options.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: options.clientId,
          refresh_token: refreshToken,
        }).toString(),
      });
    } catch {
      return { ok: false, reason: "network" };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, reason: "malformed_response", status: res.status };
    }

    if (!res.ok) {
      return { ok: false, reason: parseTokenError(data, res.status), status: res.status };
    }

    const accessToken =
      data && typeof data === "object" && "access_token" in data
        ? (data as { access_token: unknown }).access_token
        : null;
    if (typeof accessToken !== "string" || !accessToken) {
      return { ok: false, reason: "malformed_response", status: res.status };
    }

    const nextRefresh =
      data && typeof data === "object" && "refresh_token" in data
        ? (data as { refresh_token: unknown }).refresh_token
        : undefined;
    const rotatedRefreshToken = typeof nextRefresh === "string" && nextRefresh.length > 0;

    await options.store.setAccessToken(accessToken);
    if (rotatedRefreshToken) {
      await options.store.setRefreshToken(nextRefresh);
    }

    const storedRefresh = rotatedRefreshToken
      ? nextRefresh
      : await options.store.getRefreshToken();

    return {
      ok: true,
      tokens: { accessToken, refreshToken: storedRefresh },
      rotatedRefreshToken,
    };
  }

  async function refresh(): Promise<RefreshResult> {
    if (!inflight) {
      inflight = performRefresh().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  return {
    refresh,
    isRefreshing: () => inflight != null,
  };
}
