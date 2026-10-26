import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { env as testEnv } from "cloudflare:test";
import {
  DEFAULT_ALLOWED_CLIENT_IDS,
  getAllowedClientIDs,
  getOptionalUser,
  getRefreshedCookies,
  isAllowedAudience,
  requireUser,
  trySilentRefresh,
  verifyAccessToken,
  verifyBearerToken,
} from "../app/auth.server";
import { loader as todosLoader } from "../app/routes/api.v1.todos";
import { loader as listsLoader } from "../app/routes/api.v1.lists";

/**
 * These tests sign real ES256 access tokens shaped exactly like sYnID's
 * (OpenAuth 0.4.3: mode/type/properties/aud/iss/sub/exp) and serve the matching
 * JWKS from a stubbed issuer, so OpenAuth's real `client.verify` runs.
 */
const ISSUER = "https://auth.audience-test.invalid";
const ENV = { OPENAUTH_ISSUER: ISSUER } as const;
const KID = "test-es256-key";

let signingKey: CryptoKey;
let publicJwk: JsonWebKey;
let otherSigningKey: CryptoKey;
/** Access token the stubbed /token endpoint returns for refresh grants. */
let nextRefreshedAccess: string | null = null;
let tokenEndpointCalls = 0;

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signAccessToken(
  claims: { aud?: unknown; exp?: number; iss?: string; mode?: string },
  key: CryptoKey = signingKey,
): Promise<string> {
  const header = { alg: "ES256", kid: KID, typ: "JWT" };
  const payload: Record<string, unknown> = {
    mode: claims.mode ?? "access",
    type: "user",
    properties: { id: "user_aud_test", email: "aud@example.com" },
    iss: claims.iss ?? ISSUER,
    sub: "user:aud-test",
    exp: claims.exp ?? Math.floor(Date.now() / 1000) + 900,
  };
  if ("aud" in claims) payload.aud = claims.aud;
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(signature)}`;
}

function bearer(path: string, token: string) {
  return new Request(`https://synx.christran.io${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function withCookies(path: string, cookies: string) {
  return new Request(`https://synx.christran.io${path}`, { headers: { Cookie: cookies } });
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: { cloudflare: { env: { ...testEnv, ...ENV } } },
  } as any;
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  signingKey = pair.privateKey;
  publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const other = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  otherSigningKey = other.privateKey;

  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === `${ISSUER}/.well-known/oauth-authorization-server`) {
      return Response.json({
        issuer: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        token_endpoint: `${ISSUER}/token`,
      });
    }
    if (url === `${ISSUER}/.well-known/jwks.json`) {
      return Response.json({ keys: [{ ...publicJwk, kid: KID, alg: "ES256", use: "sig" }] });
    }
    if (url === `${ISSUER}/token`) {
      tokenEndpointCalls++;
      if (!nextRefreshedAccess) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({
        access_token: nextRefreshedAccess,
        refresh_token: "user:aud-test:rotated-refresh",
        expires_in: 900,
      });
    }
    return realFetch(input as any, init);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  nextRefreshedAccess = null;
  tokenEndpointCalls = 0;
});

describe("audience allowlist", () => {
  it("defaults to sYnX's own client ID only", () => {
    expect(DEFAULT_ALLOWED_CLIENT_IDS).toEqual(["synx"]);
    expect(getAllowedClientIDs({})).toEqual(["synx"]);
    expect(getAllowedClientIDs(undefined)).toEqual(["synx"]);
    expect(getAllowedClientIDs({ SYNX_ALLOWED_CLIENT_IDS: " , " })).toEqual(["synx"]);
  });

  it("accepts a comma-separated override from SYNX_ALLOWED_CLIENT_IDS", () => {
    expect(getAllowedClientIDs({ SYNX_ALLOWED_CLIENT_IDS: "synx, synx-preview" })).toEqual([
      "synx",
      "synx-preview",
    ]);
  });

  it("requires every aud value to be allowed and rejects a missing aud", () => {
    expect(isAllowedAudience("synx", ["synx"])).toBe(true);
    expect(isAllowedAudience("illusyn", ["synx"])).toBe(false);
    expect(isAllowedAudience(undefined, ["synx"])).toBe(false);
    expect(isAllowedAudience("", ["synx"])).toBe(false);
    expect(isAllowedAudience([], ["synx"])).toBe(false);
    expect(isAllowedAudience(["synx"], ["synx"])).toBe(true);
    expect(isAllowedAudience(["synx", "illusyn"], ["synx"])).toBe(false);
  });
});

describe("verifyAccessToken (shared helper, real ES256 tokens)", () => {
  const req = () => new Request("https://synx.christran.io/");

  it("accepts a token issued to synx", async () => {
    const token = await signAccessToken({ aud: "synx" });
    expect(await verifyAccessToken(req(), ENV, token)).toEqual({
      userId: "user_aud_test",
      email: "aud@example.com",
    });
  });

  it.each(["illusyn", "synapse", "demo-client"])("rejects a token issued to %s", async (aud) => {
    const token = await signAccessToken({ aud });
    expect(await verifyAccessToken(req(), ENV, token)).toBeNull();
  });

  it("rejects a token with no aud claim", async () => {
    const token = await signAccessToken({});
    expect(await verifyAccessToken(req(), ENV, token)).toBeNull();
  });

  it("rejects a multi-audience token that names another client", async () => {
    const token = await signAccessToken({ aud: ["synx", "illusyn"] });
    expect(await verifyAccessToken(req(), ENV, token)).toBeNull();
  });

  it("still rejects bad signatures, wrong issuer, expired, and non-access tokens", async () => {
    expect(await verifyAccessToken(req(), ENV, await signAccessToken({ aud: "synx" }, otherSigningKey))).toBeNull();
    expect(await verifyAccessToken(req(), ENV, await signAccessToken({ aud: "synx", iss: "https://evil.invalid" }))).toBeNull();
    expect(
      await verifyAccessToken(req(), ENV, await signAccessToken({ aud: "synx", exp: Math.floor(Date.now() / 1000) - 60 })),
    ).toBeNull();
    expect(await verifyAccessToken(req(), ENV, await signAccessToken({ aud: "synx", mode: "refresh" }))).toBeNull();
    expect(await verifyAccessToken(req(), ENV, "not-a-jwt")).toBeNull();
    expect(await verifyAccessToken(req(), ENV, null)).toBeNull();
  });

  it("honors SYNX_ALLOWED_CLIENT_IDS when set", async () => {
    const token = await signAccessToken({ aud: "synx-preview" });
    expect(await verifyAccessToken(req(), ENV, token)).toBeNull();
    expect(
      await verifyAccessToken(req(), { ...ENV, SYNX_ALLOWED_CLIENT_IDS: "synx,synx-preview" }, token),
    ).not.toBeNull();
  });
});

describe("mobile API bearer auth (verifyBearerToken + /api/v1 routes)", () => {
  it("accepts a synx bearer token", async () => {
    const token = await signAccessToken({ aud: "synx" });
    const user = await verifyBearerToken(bearer("/api/v1/lists", token), ENV);
    expect(user?.userId).toBe("user_aud_test");
    expect(user?.token).toBe(token);
  });

  it("rejects bearer tokens for another client or with no aud", async () => {
    expect(await verifyBearerToken(bearer("/api/v1/lists", await signAccessToken({ aud: "illusyn" })), ENV)).toBeNull();
    expect(await verifyBearerToken(bearer("/api/v1/lists", await signAccessToken({})), ENV)).toBeNull();
  });

  it("does not attempt a cookie refresh for a rejected bearer token", async () => {
    const req = new Request("https://synx.christran.io/api/v1/lists", {
      headers: {
        Authorization: `Bearer ${await signAccessToken({ aud: "illusyn" })}`,
        Cookie: "synx_refresh_session=user:aud-test:refresh",
      },
    });
    expect(await verifyBearerToken(req, ENV)).toBeNull();
    expect(tokenEndpointCalls).toBe(0);
  });

  it("API routes return 401 for a foreign-client token and pass auth for synx", async () => {
    const foreign = await signAccessToken({ aud: "illusyn" });
    const noAud = await signAccessToken({});
    const own = await signAccessToken({ aud: "synx" });

    for (const token of [foreign, noAud]) {
      const todos = await todosLoader(routeArgs(bearer("/api/v1/todos", token)));
      expect(todos.status).toBe(401);
      const lists = await listsLoader(routeArgs(bearer("/api/v1/lists", token)));
      expect(lists.status).toBe(401);
    }

    // Auth passes; the route then fails on its own validation (missing listId).
    const ok = await todosLoader(routeArgs(bearer("/api/v1/todos", own)));
    expect(ok.status).toBe(400);
  });
});

describe("web cookie sessions (requireUser / getOptionalUser / cookie-backed API)", () => {
  it("requireUser accepts a synx session cookie", async () => {
    const token = await signAccessToken({ aud: "synx" });
    const user = await requireUser(withCookies("/app", `synx_auth_session=${token}`), ENV);
    expect(user.userId).toBe("user_aud_test");
  });

  it("requireUser redirects to /login and clears cookies for a foreign or aud-less session", async () => {
    for (const token of [await signAccessToken({ aud: "illusyn" }), await signAccessToken({})]) {
      let thrown: unknown;
      try {
        await requireUser(withCookies("/app", `synx_auth_session=${token}`), ENV);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Response);
      const res = thrown as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/login");
      expect(res.headers.getSetCookie().some((c) => c.startsWith("synx_auth_session=;"))).toBe(true);
    }
  });

  it("getOptionalUser treats a foreign session as a guest", async () => {
    const own = await getOptionalUser(
      withCookies("/", `synx_auth_session=${await signAccessToken({ aud: "synx" })}`),
      ENV,
    );
    expect(own.isLoggedIn).toBe(true);

    const foreign = await getOptionalUser(
      withCookies("/", `synx_auth_session=${await signAccessToken({ aud: "illusyn" })}`),
      ENV,
    );
    expect(foreign.isLoggedIn).toBe(false);
    expect(foreign.userId.startsWith("guest_")).toBe(true);

    const noAud = await getOptionalUser(withCookies("/", `synx_auth_session=${await signAccessToken({})}`), ENV);
    expect(noAud.isLoggedIn).toBe(false);
  });

  it("cookie-backed API calls reject a foreign session cookie", async () => {
    const req = withCookies("/api/v1/lists", `synx_auth_session=${await signAccessToken({ aud: "illusyn" })}`);
    expect(await verifyBearerToken(req, ENV)).toBeNull();
    const res = await listsLoader(
      routeArgs(withCookies("/api/v1/lists", `synx_auth_session=${await signAccessToken({ aud: "illusyn" })}`)),
    );
    expect(res.status).toBe(401);
  });
});

describe("silent refresh never hands back a token for another client", () => {
  it("accepts and stores a refreshed synx token", async () => {
    nextRefreshedAccess = await signAccessToken({ aud: "synx" });
    const req = withCookies("/app", "synx_refresh_session=user:aud-test:refresh");
    const renewed = await trySilentRefresh(req, ENV, null);
    expect(renewed?.token).toBe(nextRefreshedAccess);
    expect(getRefreshedCookies(req).some((c) => c.startsWith("synx_auth_session="))).toBe(true);
  });

  it("rejects a refreshed token issued to another client and stores no cookies", async () => {
    for (const minted of [await signAccessToken({ aud: "illusyn" }), await signAccessToken({})]) {
      nextRefreshedAccess = minted;
      const req = withCookies("/app", "synx_refresh_session=user:aud-test:refresh");
      expect(await trySilentRefresh(req, ENV, null)).toBeNull();
      expect(getRefreshedCookies(req)).toEqual([]);
    }
    expect(tokenEndpointCalls).toBe(2);
  });

  it("requireUser logs out instead of accepting a foreign refreshed token", async () => {
    nextRefreshedAccess = await signAccessToken({ aud: "illusyn" });
    const req = withCookies("/app", "synx_refresh_session=user:aud-test:refresh");
    await expect(requireUser(req, ENV)).rejects.toBeInstanceOf(Response);
    expect(getRefreshedCookies(req)).toEqual([]);
  });

  it("getOptionalUser and cookie-backed API fall back to guest / 401 on a foreign refreshed token", async () => {
    nextRefreshedAccess = await signAccessToken({ aud: "illusyn" });
    const opt = await getOptionalUser(withCookies("/", "synx_refresh_session=user:aud-test:refresh"), ENV);
    expect(opt.isLoggedIn).toBe(false);
    const res = await listsLoader(routeArgs(withCookies("/api/v1/lists", "synx_refresh_session=user:aud-test:refresh")));
    expect(res.status).toBe(401);
  });
});
