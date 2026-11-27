import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { env as workerEnv } from "cloudflare:test";
import { cloudflareContext } from "../backend/services/context.server";
import { handleApiRequest } from "../backend/api/router";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_ID_COOKIE,
  GUEST_SESSION_COOKIE,
  PKCE_COOKIE_NAME,
  parseAuthSessionCookie,
  parseGuestSessionCookie,
  parsePkceCookie,
  parseRefreshCookie,
  parseSessionIdCookie,
  serializeGuestSessionCookie,
  serializePkceCookie,
} from "../backend/services/auth-cookies.server";
import {
  getOptionalUser,
  getRefreshedCookies,
  requireUser,
  subjects,
  trySilentRefresh,
  verifyAccessToken,
  verifyBearerToken,
} from "../backend/services/auth.server";
import {
  createAuthSession,
  hashAccessToken,
  pruneExpiredAuthSessions,
  REVOKED_SESSION_RETENTION_MS,
  revokeAuthSessionById,
} from "../backend/services/auth-sessions.server";
import {
  resetJwksCacheForTests,
  verifyAccessJwtWithJwks,
} from "../backend/services/jwks-verifier.server";
import * as providerModule from "../backend/services/provider-profile.server";
import { loader as callbackLoader } from "../web/app/routes/callback";
import { action as logoutAction, loader as logoutLoader } from "../web/app/routes/logout";
import { loader as indexLoader } from "../web/app/routes/_index";

const ISSUER = "https://auth.hardening-test.invalid";

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

async function generateEs256Pair(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = {
    ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey),
    kid,
    alg: "ES256",
    use: "sig",
  };
  return { privateKey: pair.privateKey, publicJwk };
}

async function signEs256Token(
  privateKey: CryptoKey,
  kid: string,
  claims: {
    userId?: string;
    email?: string;
    aud?: string;
    iss?: string;
    exp?: number;
    nonce?: string;
  } = {},
): Promise<string> {
  const header = { alg: "ES256", kid, typ: "JWT" };
  const payload = {
    mode: "access",
    type: "user",
    properties: {
      id: claims.userId ?? "user_hardening",
      email: claims.email ?? "hardening@example.com",
    },
    aud: claims.aud ?? "synx",
    iss: claims.iss ?? ISSUER,
    sub: `user:${claims.userId ?? "user_hardening"}`,
    exp: claims.exp ?? Math.floor(Date.now() / 1000) + 900,
    ...(claims.nonce ? { jti: claims.nonce } : {}),
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
}

async function signRs256Token(privateKey: CryptoKey, kid: string): Promise<string> {
  const header = { alg: "RS256", kid, typ: "JWT" };
  const payload = {
    mode: "access",
    type: "user",
    properties: { id: "user_rsa", email: "rsa@example.com" },
    aud: "synx",
    iss: ISSUER,
    sub: "user:rsa",
    exp: Math.floor(Date.now() / 1000) + 900,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
}

function createProvider(envOverrides: Record<string, unknown> = {}): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, {
    env: {
      DB: workerEnv.DB,
      OPENAUTH_ISSUER: ISSUER,
      ...envOverrides,
    } as unknown as Env,
    ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
  });
  return provider;
}

describe("Issue #252 sYnID hardening", () => {
  let key1: Awaited<ReturnType<typeof generateEs256Pair>>;
  let key2: Awaited<ReturnType<typeof generateEs256Pair>>;
  let key3: Awaited<ReturnType<typeof generateEs256Pair>>;
  let rsaPrivateKey: CryptoKey;

  let activeJwks: JsonWebKey[];
  let discoveryFetches = 0;
  let jwksFetches = 0;
  let fakeNow = 1_000_000;
  let nextTokenExchange: { access: string; refresh: string } | null = null;
  let nextTokenRefresh: { access: string; refresh?: string } | null = null;

  beforeAll(async () => {
    key1 = await generateEs256Pair("kid-1");
    key2 = await generateEs256Pair("kid-2");
    key3 = await generateEs256Pair("kid-3");
    const rsaPair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    rsaPrivateKey = rsaPair.privateKey;
  });

  beforeEach(async () => {
    resetJwksCacheForTests();
    vi.restoreAllMocks();
    activeJwks = [key1.publicJwk];
    discoveryFetches = 0;
    jwksFetches = 0;
    fakeNow = 1_000_000;
    nextTokenExchange = null;
    nextTokenRefresh = null;

    await workerEnv.DB.batch([
      workerEnv.DB.prepare("DELETE FROM auth_session_tokens"),
      workerEnv.DB.prepare("DELETE FROM auth_sessions"),
    ]);

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === `${ISSUER}/.well-known/oauth-authorization-server`) {
        discoveryFetches++;
        return Response.json({
          issuer: ISSUER,
          jwks_uri: `${ISSUER}/.well-known/jwks.json`,
          token_endpoint: `${ISSUER}/token`,
        });
      }
      if (url === `${ISSUER}/.well-known/jwks.json`) {
        jwksFetches++;
        return Response.json({ keys: activeJwks });
      }
      if (url === `${ISSUER}/token`) {
        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : "";
        const params = new URLSearchParams(bodyText);
        const grantType = params.get("grant_type");
        if (grantType === "authorization_code" && nextTokenExchange) {
          return Response.json({
            access_token: nextTokenExchange.access,
            refresh_token: nextTokenExchange.refresh,
            expires_in: 900,
          });
        }
        if (grantType === "refresh_token" && nextTokenRefresh) {
          return Response.json({
            access_token: nextTokenRefresh.access,
            ...(nextTokenRefresh.refresh
              ? { refresh_token: nextTokenRefresh.refresh }
              : {}),
            expires_in: 900,
          });
        }
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      return realFetch(input as Parameters<typeof fetch>[0], init);
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe("JWKS algorithm pinning and unknown-kid refetch cooldown", () => {
    it("accepts ES256, rejects RS256/HS256/none, refetches only on unknown kid, and enforces cooldown", async () => {
      const opts = { issuer: ISSUER, subjects, now: () => fakeNow, cooldownMs: 60_000 };
      const t1 = await signEs256Token(key1.privateKey, "kid-1", { nonce: "n1" });
      const res1 = await verifyAccessJwtWithJwks(t1, opts);
      expect(res1?.subject.properties.id).toBe("user_hardening");
      expect(discoveryFetches).toBe(1);
      expect(jwksFetches).toBe(1);

      // Known kid never triggers a refetch even far later (no TTL refetch)
      fakeNow += 10 * 60 * 60 * 1000;
      const resKnown = await verifyAccessJwtWithJwks(t1, opts);
      expect(resKnown).not.toBeNull();
      expect(jwksFetches).toBe(1);

      // Non-ES256 algorithms are rejected without triggering JWKS refetches
      const rsToken = await signRs256Token(rsaPrivateKey, "unknown-rsa-kid");
      expect(await verifyAccessJwtWithJwks(rsToken, opts)).toBeNull();

      const hsPayload = b64url(
        JSON.stringify({
          mode: "access",
          type: "user",
          properties: { id: "u", email: "e@example.com" },
          aud: "synx",
          iss: ISSUER,
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      );
      const hsHeader = b64url(JSON.stringify({ alg: "HS256", kid: "unknown-hs", typ: "JWT" }));
      expect(await verifyAccessJwtWithJwks(`${hsHeader}.${hsPayload}.sig`, opts)).toBeNull();

      const noneHeader = b64url(JSON.stringify({ alg: "none", kid: "unknown-none", typ: "JWT" }));
      expect(await verifyAccessJwtWithJwks(`${noneHeader}.${hsPayload}.`, opts)).toBeNull();
      expect(jwksFetches).toBe(1);

      // Key rotation: unknown kid triggers one JWKS refetch and succeeds
      activeJwks = [key1.publicJwk, key2.publicJwk];
      const t2 = await signEs256Token(key2.privateKey, "kid-2", { nonce: "n2" });
      const res2 = await verifyAccessJwtWithJwks(t2, opts);
      expect(res2?.subject.properties.id).toBe("user_hardening");
      expect(jwksFetches).toBe(2);

      // Flood of unknown kids within cooldown triggers 0 refetches right after t2's refetch
      fakeNow += 1_000;
      const forgedDuringCooldown = await signEs256Token(key3.privateKey, "forged-early", {
        nonce: "bad-early",
      });
      expect(await verifyAccessJwtWithJwks(forgedDuringCooldown, opts)).toBeNull();
      expect(jwksFetches).toBe(2);

      // Once cooldown expires, first forged unknown kid triggers 1 refetch, then subsequent flood is rate-limited
      fakeNow += 60_000;
      for (let i = 0; i < 5; i++) {
        const bad = await signEs256Token(key3.privateKey, `forged-${i}`, { nonce: `bad-${i}` });
        expect(await verifyAccessJwtWithJwks(bad, opts)).toBeNull();
        fakeNow += 1_000;
      }
      expect(jwksFetches).toBe(3);

      // Once cooldown expires, a real key rotation to kid-3 succeeds
      fakeNow += 60_000;
      activeJwks = [key2.publicJwk, key3.publicJwk];
      const t3 = await signEs256Token(key3.privateKey, "kid-3", { nonce: "n3" });
      const res3 = await verifyAccessJwtWithJwks(t3, opts);
      expect(res3?.subject.properties.id).toBe("user_hardening");
      expect(jwksFetches).toBe(4);
    });
  });

  describe("Anchored cookie parsing and guest_session Secure attribute", () => {
    it("ignores look-alike cookie names for session, refresh, pkce, guest, and session id", async () => {
      const validToken = await signEs256Token(key1.privateKey, "kid-1");
      const pkceHeader = serializePkceCookie("https://synx.christran.io/login", {
        state: "st-real",
        verifier: "vf-real",
      });
      const pkceVal = pkceHeader.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);

      const lookAlikeOnly = new Request("https://synx.christran.io/", {
        headers: {
          Cookie: [
            `fake_${AUTH_SESSION_COOKIE}=${validToken}`,
            `${AUTH_SESSION_COOKIE}_v2=${validToken}`,
            `prefix_${AUTH_REFRESH_COOKIE}=ref-fake`,
            `my_${PKCE_COOKIE_NAME}=${pkceVal}`,
            `evil_${GUEST_SESSION_COOKIE}=guest_11111111-1111-4111-8111-111111111111`,
            `copy_${AUTH_SESSION_ID_COOKIE}=sess-fake`,
          ].join("; "),
        },
      });

      expect(parseAuthSessionCookie(lookAlikeOnly)).toBeNull();
      expect(parseRefreshCookie(lookAlikeOnly)).toBeNull();
      expect(parsePkceCookie(lookAlikeOnly)).toBeNull();
      expect(parseGuestSessionCookie(lookAlikeOnly)).toBeNull();
      expect(parseSessionIdCookie(lookAlikeOnly)).toBeNull();
      expect(
        await verifyBearerToken(lookAlikeOnly, { DB: workerEnv.DB, OPENAUTH_ISSUER: ISSUER }),
      ).toBeNull();

      const lookAlikePlusReal = new Request("https://synx.christran.io/", {
        headers: {
          Cookie: [
            `fake_${AUTH_SESSION_COOKIE}=bogus`,
            `${AUTH_SESSION_COOKIE}=${validToken}`,
            `evil_${GUEST_SESSION_COOKIE}=guest_bad`,
            `${GUEST_SESSION_COOKIE}=guest_22222222-2222-4222-8222-222222222222`,
            `other_${AUTH_SESSION_ID_COOKIE}=bad-sess`,
            `${AUTH_SESSION_ID_COOKIE}=sess-real`,
          ].join("; "),
        },
      });

      expect(parseAuthSessionCookie(lookAlikePlusReal)).toBe(validToken);
      expect(parseGuestSessionCookie(lookAlikePlusReal)).toBe(
        "guest_22222222-2222-4222-8222-222222222222",
      );
      expect(parseSessionIdCookie(lookAlikePlusReal)).toBe("sess-real");
    });

    it("sets Secure on HTTPS guest_session cookies and omits Secure on HTTP localhost", async () => {
      const httpsCookie = serializeGuestSessionCookie(
        "https://synx.christran.io/",
        "guest_33333333-3333-4333-8333-333333333333",
      );
      expect(httpsCookie).toContain("Secure");
      expect(httpsCookie).toContain("HttpOnly");
      expect(httpsCookie).toContain("SameSite=Lax");
      expect(httpsCookie).toContain("Path=/");
      expect(httpsCookie).not.toContain("Domain=");

      const httpCookie = serializeGuestSessionCookie(
        "http://localhost:5173/",
        "guest_33333333-3333-4333-8333-333333333333",
      );
      expect(httpCookie).not.toContain("Secure");
      expect(httpCookie).toContain("HttpOnly");

      // Web root SSR loader emits Secure on HTTPS requests
      const res = await indexLoader({
        request: new Request("https://synx.christran.io/", {
          headers: { Accept: "text/html" },
        }),
        params: {},
        context: createProvider(),
      } as unknown as Parameters<typeof indexLoader>[0]);
      const setCookies =
        (res as { init?: ResponseInit | null })?.init?.headers instanceof Headers
          ? (res as { init: { headers: Headers } }).init.headers.getSetCookie()
          : res instanceof Response
            ? res.headers.getSetCookie()
            : [];
      const guestSetCookie = setCookies.find((c) => c.startsWith(`${GUEST_SESSION_COOKIE}=`));
      expect(guestSetCookie).toBeTruthy();
      expect(guestSetCookie).toContain("Secure");
      expect(guestSetCookie).not.toContain("Domain=");
    });
  });

  describe("Web server-side session lifecycle, refresh, and logout revocation", () => {
    it("creates hashed session on callback, links silent refresh, preserves Domain=.christran.io, and revokes on local logout", async () => {
      vi.spyOn(providerModule, "syncProviderProfile").mockResolvedValue();
      const access1 = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_web_1",
        nonce: "web-1",
      });
      nextTokenExchange = { access: access1, refresh: "user:web1:r1" };

      const pkceCookie = serializePkceCookie("https://synx.christran.io/login", {
        state: "state-1",
        verifier: "verifier-1",
      });
      const pkceVal = pkceCookie.split(";")[0].slice(`${PKCE_COOKIE_NAME}=`.length);

      const cbRes = await callbackLoader({
        request: new Request("https://synx.christran.io/callback?code=c1&state=state-1", {
          headers: { Cookie: `${PKCE_COOKIE_NAME}=${pkceVal}` },
        }),
        params: {},
        context: createProvider(),
      } as unknown as Parameters<typeof callbackLoader>[0]);

      const setCookies = cbRes.headers.getSetCookie();
      const authCookie = setCookies.find((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=`))!;
      const refreshCookie = setCookies.find((c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=`))!;
      const sessionIdCookie = setCookies.find((c) => c.startsWith(`${AUTH_SESSION_ID_COOKIE}=`))!;
      expect(authCookie).toContain("Domain=.christran.io");
      expect(refreshCookie).toContain("Domain=.christran.io");
      expect(sessionIdCookie).not.toContain("Domain=");
      expect(sessionIdCookie).toContain("Secure");

      const sessionId = decodeURIComponent(
        sessionIdCookie.split(";")[0].slice(`${AUTH_SESSION_ID_COOKIE}=`.length),
      );

      // Token hash is stored instead of raw JWT
      const tokenRow = await workerEnv.DB.prepare(
        "SELECT token_hash, session_id FROM auth_session_tokens WHERE session_id = ?",
      )
        .bind(sessionId)
        .first<{ token_hash: string; session_id: string }>();
      expect(tokenRow?.token_hash).toBe(await hashAccessToken(access1));
      expect(tokenRow?.token_hash).not.toBe(access1);

      const env = { DB: workerEnv.DB, OPENAUTH_ISSUER: ISSUER };

      // Live access1 is valid
      expect(
        await verifyAccessToken(new Request("https://synx.christran.io/"), env, access1),
      ).toEqual({
        userId: "user_web_1",
        email: "hardening@example.com",
      });

      // Silent refresh links access2 to the SAME session row
      const access2 = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_web_1",
        nonce: "web-2",
      });
      nextTokenRefresh = { access: access2, refresh: "user:web1:r2" };
      const refreshReq = new Request("https://synx.christran.io/app", {
        headers: {
          Cookie: `${AUTH_REFRESH_COOKIE}=user:web1:r1; ${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
        },
      });
      const refreshed = await trySilentRefresh(refreshReq, env);
      expect(refreshed?.token).toBe(access2);
      expect(
        getRefreshedCookies(refreshReq).some((c) => c.startsWith(`${AUTH_SESSION_COOKIE}=`)),
      ).toBe(true);

      // Local logout revokes the session and clears all cookies
      const logoutRes = await logoutAction({
        request: new Request("https://synx.christran.io/logout?local=true", {
          method: "POST",
          headers: {
            Cookie: `${AUTH_SESSION_COOKIE}=${access2}; ${AUTH_REFRESH_COOKIE}=user:web1:r2; ${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
          },
        }),
        params: {},
        context: createProvider(),
      } as unknown as Parameters<typeof logoutAction>[0]);

      const clearedCookies = logoutRes.headers.getSetCookie();
      expect(
        clearedCookies.some(
          (c) => c.startsWith(`${AUTH_SESSION_COOKIE}=;`) && c.includes("Max-Age=0"),
        ),
      ).toBe(true);
      expect(
        clearedCookies.some(
          (c) => c.startsWith(`${AUTH_REFRESH_COOKIE}=;`) && c.includes("Max-Age=0"),
        ),
      ).toBe(true);
      expect(
        clearedCookies.some(
          (c) => c.startsWith(`${AUTH_SESSION_ID_COOKIE}=;`) && c.includes("Max-Age=0"),
        ),
      ).toBe(true);

      // Both access1 and access2 (unexpired JWTs) are now rejected everywhere
      expect(
        await verifyAccessToken(new Request("https://synx.christran.io/"), env, access1),
      ).toBeNull();
      expect(
        await verifyAccessToken(new Request("https://synx.christran.io/"), env, access2),
      ).toBeNull();
      await expect(
        requireUser(
          new Request("https://synx.christran.io/app", {
            headers: {
              Cookie: `${AUTH_SESSION_COOKIE}=${access2}; ${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
            },
          }),
          env,
        ),
      ).rejects.toBeInstanceOf(Response);
    });

    it("keeps cancel-and-return signed in after POST /logout, and revokes when sYnID /logout/all clears auth cookies", async () => {
      const access = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_cancel_1",
        nonce: "cancel-1",
      });
      const sessionId = await createAuthSession(workerEnv.DB, {
        userId: "user_cancel_1",
        source: "web",
        accessToken: access,
      });

      // 1. POST /logout redirects to central sYnID logout without revoking
      const centralRes = await logoutAction({
        request: new Request("https://synx.christran.io/logout", {
          method: "POST",
          headers: {
            Cookie: `${AUTH_SESSION_COOKIE}=${access}; ${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
          },
        }),
        params: {},
        context: createProvider(),
      } as unknown as Parameters<typeof logoutAction>[0]);
      expect(centralRes.headers.get("Location")).toContain(`${ISSUER}/logout`);

      // User clicks "Cancel and return": cookies are still present -> still signed in
      const env = { DB: workerEnv.DB, OPENAUTH_ISSUER: ISSUER };
      const stillSignedIn = await getOptionalUser(
        new Request("https://synx.christran.io/", {
          headers: {
            Cookie: `${AUTH_SESSION_COOKIE}=${access}; ${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
          },
        }),
        env,
      );
      expect(stillSignedIn.isLoggedIn).toBe(true);
      expect(stillSignedIn.userId).toBe("user_cancel_1");

      // 2. User completes /logout/all on sYnID, which clears shared auth & refresh cookies.
      // Browser arrives at sYnX with only host-only synx_session_id remaining:
      const postLogoutReq = new Request("https://synx.christran.io/", {
        headers: {
          Cookie: `${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
        },
      });
      const postLogoutUser = await getOptionalUser(postLogoutReq, env);
      expect(postLogoutUser.isLoggedIn).toBe(false);
      expect(
        getRefreshedCookies(postLogoutReq).some(
          (c) => c.startsWith(`${AUTH_SESSION_ID_COOKIE}=;`) && c.includes("Max-Age=0"),
        ),
      ).toBe(true);

      // Session is revoked in D1, so a stolen copy of `access` is rejected immediately
      const row = await workerEnv.DB.prepare(
        "SELECT revoked_reason FROM auth_sessions WHERE id = ?",
      )
        .bind(sessionId)
        .first<{ revoked_reason: string | null }>();
      expect(row?.revoked_reason).toBe("logout_central");
      expect(
        await verifyAccessToken(new Request("https://synx.christran.io/"), env, access),
      ).toBeNull();
    });

    it("accepts pre-migration untracked tokens until expiry and mints a session row on first refresh", async () => {
      const untracked = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_legacy_1",
        nonce: "legacy-1",
      });
      const env = { DB: workerEnv.DB, OPENAUTH_ISSUER: ISSUER };
      expect(
        await verifyAccessToken(new Request("https://synx.christran.io/"), env, untracked),
      ).toEqual({
        userId: "user_legacy_1",
        email: "hardening@example.com",
      });

      const freshAccess = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_legacy_1",
        nonce: "legacy-2",
      });
      nextTokenRefresh = { access: freshAccess, refresh: "user:legacy:r2" };
      const req = new Request("https://synx.christran.io/", {
        headers: { Cookie: `${AUTH_REFRESH_COOKIE}=user:legacy:r1` },
      });
      const renewed = await trySilentRefresh(req, env);
      expect(renewed?.token).toBe(freshAccess);

      const sessionCookie = getRefreshedCookies(req).find((c) =>
        c.startsWith(`${AUTH_SESSION_ID_COOKIE}=`),
      );
      expect(sessionCookie).toBeTruthy();
      const mintedSessionId = decodeURIComponent(
        sessionCookie!.split(";")[0].slice(`${AUTH_SESSION_ID_COOKIE}=`.length),
      );
      await revokeAuthSessionById(workerEnv.DB, mintedSessionId, "logout_local");
      expect(
        await verifyAccessToken(new Request("https://synx.christran.io/"), env, freshAccess),
      ).toBeNull();
    });

    it("revokes local session on GET /logout?local=true too", async () => {
      const access = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_get_logout",
        nonce: "get-logout-1",
      });
      const sessionId = await createAuthSession(workerEnv.DB, {
        userId: "user_get_logout",
        source: "web",
        accessToken: access,
      });

      await logoutLoader({
        request: new Request("https://synx.christran.io/logout?local=true", {
          headers: {
            Cookie: `${AUTH_SESSION_COOKIE}=${access}; ${AUTH_SESSION_ID_COOKIE}=${sessionId}`,
          },
        }),
        params: {},
        context: createProvider(),
      } as unknown as Parameters<typeof logoutLoader>[0]);

      expect(
        await verifyAccessToken(
          new Request("https://synx.christran.io/"),
          { DB: workerEnv.DB, OPENAUTH_ISSUER: ISSUER },
          access,
        ),
      ).toBeNull();
    });
  });

  describe("Mobile session endpoints and pruning", () => {
    it("registers, refreshes, and revokes mobile bearer tokens so /api/v1 rejects them immediately", async () => {
      const mobileAccess1 = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_mobile_1",
        nonce: "mob-1",
      });
      const mobileAccess2 = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_mobile_1",
        nonce: "mob-2",
      });

      // 1. Register mobile session on sign-in
      const regRes1 = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mobileAccess1}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }),
        createProvider(),
      );
      expect(regRes1?.status).toBe(200);
      const { sessionId } = (await regRes1!.json()) as { sessionId: string };
      expect(typeof sessionId).toBe("string");

      // 2. Link refreshed mobile access token to same session
      const regRes2 = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mobileAccess2}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        }),
        createProvider(),
      );
      expect(regRes2?.status).toBe(200);
      expect(((await regRes2!.json()) as { sessionId: string }).sessionId).toBe(sessionId);

      // Both tokens work on protected endpoints before revocation
      const listsOk = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/lists", {
          headers: { Authorization: `Bearer ${mobileAccess2}` },
        }),
        createProvider(),
      );
      expect(listsOk?.status).toBe(200);

      // 3. Revoke mobile session
      const revokeRes = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/sessions/revoke", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mobileAccess2}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        }),
        createProvider(),
      );
      expect(revokeRes?.status).toBe(200);

      // Unexpired mobileAccess1 and mobileAccess2 are now rejected by API
      for (const tok of [mobileAccess1, mobileAccess2]) {
        const res = await handleApiRequest(
          new Request("https://synx.christran.io/api/v1/lists", {
            headers: { Authorization: `Bearer ${tok}` },
          }),
          createProvider(),
        );
        expect(res?.status).toBe(401);
      }

      // Attaching a new token to an already-revoked session is rejected with 401
      const mobileAccess3 = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_mobile_1",
        nonce: "mob-3",
      });
      const revokedAttach = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mobileAccess3}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        }),
        createProvider(),
      );
      expect(revokedAttach?.status).toBe(401);

      // Previously untracked mobile token is also revoked immediately if it calls /sessions/revoke
      const untrackedMobile = await signEs256Token(key1.privateKey, "kid-1", {
        userId: "user_mobile_legacy",
        nonce: "mob-legacy",
      });
      const legacyRevoke = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/sessions/revoke", {
          method: "POST",
          headers: { Authorization: `Bearer ${untrackedMobile}` },
        }),
        createProvider(),
      );
      expect(legacyRevoke?.status).toBe(200);
      const afterRevoke = await handleApiRequest(
        new Request("https://synx.christran.io/api/v1/lists", {
          headers: { Authorization: `Bearer ${untrackedMobile}` },
        }),
        createProvider(),
      );
      expect(afterRevoke?.status).toBe(401);
    });

    it("pruneExpiredAuthSessions removes expired tokens and old revoked/expired sessions while preserving active/recent ones", async () => {
      const nowMs = 10_000_000_000;
      const oldRevokedId = "sess-old-revoked";
      const recentRevokedId = "sess-recent-revoked";
      const expiredId = "sess-expired";
      const activeId = "sess-active";

      await workerEnv.DB.batch([
        workerEnv.DB.prepare(
          `INSERT INTO auth_sessions (id, user_id, source, created_at, last_seen_at, expires_at, revoked_at, revoked_reason)
           VALUES (?, 'u1', 'web', ?, ?, ?, ?, 'logout_local')`,
        ).bind(
          oldRevokedId,
          nowMs - 10 * 86_400_000,
          nowMs - 2 * 86_400_000,
          nowMs + 86_400_000,
          nowMs - REVOKED_SESSION_RETENTION_MS - 1_000,
        ),
        workerEnv.DB.prepare(
          `INSERT INTO auth_sessions (id, user_id, source, created_at, last_seen_at, expires_at, revoked_at, revoked_reason)
           VALUES (?, 'u1', 'web', ?, ?, ?, ?, 'logout_local')`,
        ).bind(recentRevokedId, nowMs - 1_000, nowMs - 500, nowMs + 86_400_000, nowMs - 1_000),
        workerEnv.DB.prepare(
          `INSERT INTO auth_sessions (id, user_id, source, created_at, last_seen_at, expires_at, revoked_at, revoked_reason)
           VALUES (?, 'u1', 'mobile', ?, ?, ?, NULL, NULL)`,
        ).bind(expiredId, nowMs - 86_400_000, nowMs - 86_400_000, nowMs - 1),
        workerEnv.DB.prepare(
          `INSERT INTO auth_sessions (id, user_id, source, created_at, last_seen_at, expires_at, revoked_at, revoked_reason)
           VALUES (?, 'u1', 'web', ?, ?, ?, NULL, NULL)`,
        ).bind(activeId, nowMs - 1_000, nowMs - 1_000, nowMs + 86_400_000),
        workerEnv.DB.prepare(
          `INSERT INTO auth_session_tokens (token_hash, session_id, user_id, created_at, expires_at)
           VALUES ('hash-expired', ?, 'u1', ?, ?)`,
        ).bind(activeId, nowMs - 1_000_000, nowMs - 1),
        workerEnv.DB.prepare(
          `INSERT INTO auth_session_tokens (token_hash, session_id, user_id, created_at, expires_at)
           VALUES ('hash-live', ?, 'u1', ?, ?)`,
        ).bind(activeId, nowMs - 1_000, nowMs + 900_000),
      ]);

      const pruned = await pruneExpiredAuthSessions(workerEnv.DB, nowMs);
      expect(pruned.sessionsDeleted).toBe(2); // oldRevoked + expired
      expect(pruned.tokensDeleted).toBe(1); // hash-expired

      const remainingSessions = (
        await workerEnv.DB.prepare("SELECT id FROM auth_sessions").all<{ id: string }>()
      ).results.map((r) => r.id);
      expect(remainingSessions.sort()).toEqual([activeId, recentRevokedId]);

      const remainingTokens = (
        await workerEnv.DB.prepare("SELECT token_hash FROM auth_session_tokens").all<{
          token_hash: string;
        }>()
      ).results.map((r) => r.token_hash);
      expect(remainingTokens).toEqual(["hash-live"]);
    });
  });
});
