import { describe, it, expect, beforeEach } from "vitest";
import * as jose from "jose";
import {
  isWorkersDevHostname,
  isWorkersDevRequest,
  extractAccessJwt,
  verifyWorkersDevAccess,
  clearJWKSCacheForTest,
  getAccessJWKS,
} from "../app/access-guard.server";

describe("access-guard", () => {
  beforeEach(() => {
    clearJWKSCacheForTest();
  });

  describe("hostname detection", () => {
    it("identifies workers.dev hostnames correctly", () => {
      expect(isWorkersDevHostname("synx.workers.dev")).toBe(true);
      expect(isWorkersDevHostname("chore-preview-synx.workers.dev")).toBe(true);
      expect(isWorkersDevHostname("v1234-synx.workers.dev")).toBe(true);
      expect(isWorkersDevHostname("WORKERS.DEV")).toBe(true);
      expect(isWorkersDevHostname("BRANCH.WORKERS.DEV")).toBe(true);
    });

    it("rejects non-workers.dev hostnames", () => {
      expect(isWorkersDevHostname("synx.christran.io")).toBe(false);
      expect(isWorkersDevHostname("localhost")).toBe(false);
      expect(isWorkersDevHostname("127.0.0.1")).toBe(false);
      expect(isWorkersDevHostname("workers.dev.attacker.com")).toBe(false);
      expect(isWorkersDevHostname("notworkers.dev")).toBe(false);
    });

    it("detects workers.dev in Request objects", () => {
      expect(isWorkersDevRequest(new Request("https://synx.workers.dev/api/v1/todos"))).toBe(true);
      expect(isWorkersDevRequest(new Request("https://synx.christran.io/api/v1/todos"))).toBe(false);
      expect(isWorkersDevRequest(new Request("http://localhost:5173/"))).toBe(false);
    });
  });

  describe("extractAccessJwt", () => {
    it("extracts JWT from Cf-Access-Jwt-Assertion header", () => {
      const request = new Request("https://synx.workers.dev/", {
        headers: { "cf-access-jwt-assertion": "mock.jwt.token" },
      });
      expect(extractAccessJwt(request)).toBe("mock.jwt.token");
    });

    it("extracts JWT from CF_Authorization cookie fallback", () => {
      const request = new Request("https://synx.workers.dev/", {
        headers: { Cookie: "foo=bar; CF_Authorization=cookie.jwt.token; other=123" },
      });
      expect(extractAccessJwt(request)).toBe("cookie.jwt.token");
    });

    it("prefers header over cookie", () => {
      const request = new Request("https://synx.workers.dev/", {
        headers: {
          "cf-access-jwt-assertion": "header.jwt.token",
          Cookie: "CF_Authorization=cookie.jwt.token",
        },
      });
      expect(extractAccessJwt(request)).toBe("header.jwt.token");
    });

    it("returns null when no token is present", () => {
      const request = new Request("https://synx.workers.dev/");
      expect(extractAccessJwt(request)).toBeNull();
    });
  });

  describe("verifyWorkersDevAccess", () => {
    const mockEnv = {
      DB: {} as D1Database,
      GUEST_WRITE_LIMITER: {} as RateLimit,
      APP_ENV: "production",
    };

    it("passes custom domain and localhost requests without restriction", async () => {
      const prodReq = new Request("https://synx.christran.io/lists");
      expect(await verifyWorkersDevAccess(prodReq, mockEnv)).toBeNull();

      const localReq = new Request("http://localhost:5173/lists");
      expect(await verifyWorkersDevAccess(localReq, mockEnv)).toBeNull();
    });

    it("blocks Version URLs on workers.dev running with production bindings", async () => {
      const versionReq = new Request("https://v1234-synx.workers.dev/lists");
      const response = await verifyWorkersDevAccess(versionReq, {
        ...mockEnv,
        APP_ENV: "production",
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
      expect(await response!.text()).toContain("Version URLs with production database bindings are disabled");
      expect(response!.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response!.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("blocks workers.dev requests when APP_ENV is undefined (defaults to production)", async () => {
      const req = new Request("https://synx.workers.dev/");
      const response = await verifyWorkersDevAccess(req, {
        ...mockEnv,
        APP_ENV: undefined as unknown as string,
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
      expect(await response!.text()).toContain("Version URLs with production database bindings are disabled");
    });

    it("rejects preview workers.dev requests when Cloudflare Access token is missing", async () => {
      const previewReq = new Request("https://chore-preview-synx.workers.dev/lists");
      const response = await verifyWorkersDevAccess(previewReq, {
        ...mockEnv,
        APP_ENV: "preview",
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
      expect(await response!.text()).toContain("Cloudflare Access authentication required for preview URLs");
      expect(response!.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("rejects preview workers.dev requests when TEAM_DOMAIN or AUD is not configured", async () => {
      const previewReq = new Request("https://chore-preview-synx.workers.dev/lists", {
        headers: { "cf-access-jwt-assertion": "mock.token" },
      });
      const response = await verifyWorkersDevAccess(previewReq, {
        ...mockEnv,
        APP_ENV: "preview",
        CF_ACCESS_TEAM_DOMAIN: undefined,
        CF_ACCESS_AUD: undefined,
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
      expect(await response!.text()).toContain(
        "Cloudflare Access team domain and AUD must be configured on preview deployments",
      );
    });

    it("cryptographically verifies Access JWT when TEAM_DOMAIN and AUD are configured", async () => {
      const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
      const publicJwk = await jose.exportJWK(publicKey);
      publicJwk.kid = "test-access-key";
      const localJwks = jose.createLocalJWKSet({ keys: [publicJwk] });

      const teamDomain = "myteam.cloudflareaccess.com";
      const aud = "aud-test-12345";
      const envWithAud = {
        ...mockEnv,
        APP_ENV: "preview",
        CF_ACCESS_TEAM_DOMAIN: teamDomain,
        CF_ACCESS_AUD: aud,
      };

      // Valid token signed with privateKey
      const validToken = await new jose.SignJWT({ email: "tester@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "test-access-key" })
        .setIssuer(`https://${teamDomain}`)
        .setAudience(aud)
        .setExpirationTime("2h")
        .sign(privateKey);

      const validReq = new Request("https://chore-preview-synx.workers.dev/lists", {
        headers: { "cf-access-jwt-assertion": validToken },
      });
      const allowed = await verifyWorkersDevAccess(validReq, envWithAud, localJwks);
      expect(allowed).toBeNull();

      // Token with mismatched audience
      const badAudToken = await new jose.SignJWT({ email: "tester@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "test-access-key" })
        .setIssuer(`https://${teamDomain}`)
        .setAudience("wrong-audience")
        .setExpirationTime("2h")
        .sign(privateKey);

      const badAudReq = new Request("https://chore-preview-synx.workers.dev/lists", {
        headers: { "cf-access-jwt-assertion": badAudToken },
      });
      const badAudRes = await verifyWorkersDevAccess(badAudReq, envWithAud, localJwks);
      expect(badAudRes).not.toBeNull();
      expect(badAudRes!.status).toBe(403);
      expect(await badAudRes!.text()).toContain("Invalid Cloudflare Access token");

      // Expired token
      const expiredToken = await new jose.SignJWT({ email: "tester@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "test-access-key" })
        .setIssuer(`https://${teamDomain}`)
        .setAudience(aud)
        .setExpirationTime("-10m")
        .sign(privateKey);

      const expiredReq = new Request("https://chore-preview-synx.workers.dev/lists", {
        headers: { "cf-access-jwt-assertion": expiredToken },
      });
      const expiredRes = await verifyWorkersDevAccess(expiredReq, envWithAud, localJwks);
      expect(expiredRes).not.toBeNull();
      expect(expiredRes!.status).toBe(403);
      expect(await expiredRes!.text()).toContain("Invalid Cloudflare Access token");
    });

    it("caches and returns the remote JWKS set instance", () => {
      const jwks1 = getAccessJWKS("team.cloudflareaccess.com");
      const jwks2 = getAccessJWKS("https://team.cloudflareaccess.com/");
      expect(jwks1).toBe(jwks2);
    });
  });
});
