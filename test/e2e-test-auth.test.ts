import { describe, expect, it } from "vitest";
import wranglerRaw from "../wrangler.jsonc?raw";
import previewRaw from "../wrangler.preview-migrations.jsonc?raw";
import {
  isLocalTestAuthAllowed,
  mintLocalTestToken,
  isLocalTestToken,
  parseLocalTestToken,
  verifyAccessToken,
  type AuthEnv,
} from "../app/auth.server";

describe("E2E Test Auth Guard & Tokens", () => {
  const loopbackUrl = "http://127.0.0.1:8787/login";
  const localhostUrl = "http://localhost:8787/login";
  const remoteUrl = "https://synx.christran.io/login";
  const httpRemoteUrl = "http://synx.christran.io/login";
  const workersDevUrl = "http://synx-preview.workers.dev/login";

  describe("isLocalTestAuthAllowed", () => {
    it("allows loopback when ALLOW_DEV_TEST_AUTH is true", () => {
      const req = new Request(loopbackUrl);
      const env: AuthEnv = { ALLOW_DEV_TEST_AUTH: "true" };
      expect(isLocalTestAuthAllowed(req, env)).toBe(true);
    });

    it("allows localhost when ALLOW_DEV_REDIRECTS is true", () => {
      const req = new Request(localhostUrl);
      const env: AuthEnv = { ALLOW_DEV_REDIRECTS: "true" };
      expect(isLocalTestAuthAllowed(req, env)).toBe(true);
    });

    it("rejects loopback when flags are missing or false", () => {
      const req = new Request(loopbackUrl);
      expect(isLocalTestAuthAllowed(req, {})).toBe(false);
      expect(isLocalTestAuthAllowed(req, { ALLOW_DEV_TEST_AUTH: "false" })).toBe(false);
      expect(isLocalTestAuthAllowed(req, { ALLOW_DEV_REDIRECTS: "0" })).toBe(false);
    });

    it("strictly rejects non-loopback hosts even if flags are true", () => {
      const env: AuthEnv = { ALLOW_DEV_TEST_AUTH: "true", ALLOW_DEV_REDIRECTS: "true" };
      expect(isLocalTestAuthAllowed(new Request(remoteUrl), env)).toBe(false);
      expect(isLocalTestAuthAllowed(new Request(httpRemoteUrl), env)).toBe(false);
      expect(isLocalTestAuthAllowed(new Request(workersDevUrl), env)).toBe(false);
    });

    it("strictly rejects HTTPS loopback to prevent spoofed remote contexts", () => {
      const env: AuthEnv = { ALLOW_DEV_TEST_AUTH: "true" };
      expect(isLocalTestAuthAllowed(new Request("https://127.0.0.1:8787/login"), env)).toBe(false);
      expect(isLocalTestAuthAllowed(new Request("https://localhost:8787/login"), env)).toBe(false);
    });
  });

  describe("mintLocalTestToken and parseLocalTestToken", () => {
    it("mints and correctly parses a valid local test token", () => {
      const user = {
        userId: "e2e_user_123",
        email: "test@example.com",
      };
      const token = mintLocalTestToken(user);
      expect(isLocalTestToken(token)).toBe(true);

      const parsed = parseLocalTestToken(token);
      expect(parsed).toEqual(user);
    });

    it("returns null for non-local test tokens", () => {
      expect(isLocalTestToken("regular_jwt_token_here")).toBe(false);
      expect(parseLocalTestToken("regular_jwt_token_here")).toBeNull();
      expect(parseLocalTestToken("")).toBeNull();
    });

    it("rejects token missing userId", () => {
      expect(parseLocalTestToken("e2e_test_session::only_email@example.com")).toBeNull();
      expect(parseLocalTestToken("e2e_test_session:only_user_no_colon")).toBeNull();
    });
  });

  describe("verifyAccessToken with local test tokens", () => {
    it("verifies test token when allowed in local dev/CI", async () => {
      const req = new Request(loopbackUrl);
      const env: AuthEnv = { ALLOW_DEV_TEST_AUTH: "true" };
      const token = mintLocalTestToken({
        userId: "usr_test_99",
        email: "test99@example.com",
      });

      const subject = await verifyAccessToken(req, env, token);
      expect(subject).toEqual({
        userId: "usr_test_99",
        email: "test99@example.com",
      });
    });

    it("rejects test token on production or remote domain", async () => {
      const req = new Request(remoteUrl);
      const env: AuthEnv = { ALLOW_DEV_TEST_AUTH: "true" };
      const token = mintLocalTestToken({
        userId: "usr_test_99",
        email: "test99@example.com",
      });

      const subject = await verifyAccessToken(req, env, token);
      expect(subject).toBeNull();
    });

    it("rejects test token if user ID starts with guest_", async () => {
      const req = new Request(loopbackUrl);
      const env: AuthEnv = { ALLOW_DEV_TEST_AUTH: "true" };
      const token = mintLocalTestToken({
        userId: "guest_spoof_attempt",
        email: "guest@example.com",
      });

      const subject = await verifyAccessToken(req, env, token);
      expect(subject).toBeNull();
    });
  });

  describe("production config safety invariants", () => {
    it("ensures wrangler.jsonc does not define dev test flags", () => {
      expect(wranglerRaw).not.toContain("ALLOW_DEV_TEST_AUTH");
      expect(wranglerRaw).not.toContain("ALLOW_DEV_REDIRECTS");
    });

    it("ensures wrangler.preview-migrations.jsonc does not define dev test flags", () => {
      expect(previewRaw).not.toContain("ALLOW_DEV_TEST_AUTH");
      expect(previewRaw).not.toContain("ALLOW_DEV_REDIRECTS");
    });
  });
});
