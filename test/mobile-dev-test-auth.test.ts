import { describe, expect, it } from "vitest";
import appJsonRaw from "../mobile/app.json?raw";
import easJsonRaw from "../mobile/eas.json?raw";
import {
  DEFAULT_PRODUCTION_API_URL,
  isAllowedLoopbackApiUrl,
  resolveDevTestAuthConfig,
} from "../mobile/src/api/devTestAuth";

describe("mobile dev test auth configuration (#200)", () => {
  describe("isAllowedLoopbackApiUrl", () => {
    it("accepts http:// loopback hosts only", () => {
      expect(isAllowedLoopbackApiUrl("http://127.0.0.1:8787")).toBe(true);
      expect(isAllowedLoopbackApiUrl("http://localhost:8787")).toBe(true);
      expect(isAllowedLoopbackApiUrl("http://test.localhost:8787")).toBe(true);
      expect(isAllowedLoopbackApiUrl("http://[::1]:8787")).toBe(true);
    });

    it("rejects https, remote domains, workers.dev, and malformed values", () => {
      expect(isAllowedLoopbackApiUrl("https://127.0.0.1:8787")).toBe(false);
      expect(isAllowedLoopbackApiUrl("https://localhost:8787")).toBe(false);
      expect(isAllowedLoopbackApiUrl("https://synx.christran.io")).toBe(false);
      expect(isAllowedLoopbackApiUrl("http://synx.christran.io")).toBe(false);
      expect(isAllowedLoopbackApiUrl("http://synx-preview.workers.dev")).toBe(false);
      expect(isAllowedLoopbackApiUrl("http://10.0.2.2:8787")).toBe(false);
      expect(isAllowedLoopbackApiUrl("")).toBe(false);
      expect(isAllowedLoopbackApiUrl(null)).toBe(false);
      expect(isAllowedLoopbackApiUrl("not-a-url")).toBe(false);
    });
  });

  describe("resolveDevTestAuthConfig", () => {
    it("defaults to disabled and production API URL when flags are absent", () => {
      expect(resolveDevTestAuthConfig({})).toEqual({
        enabled: false,
        apiBaseUrl: DEFAULT_PRODUCTION_API_URL,
      });
    });

    it("stays disabled unless both EXPO_PUBLIC_ALLOW_DEV_TEST_AUTH === 'true' and a loopback URL are present", () => {
      expect(
        resolveDevTestAuthConfig({
          allowDevTestAuth: "true",
          apiUrl: "https://synx.christran.io",
        })
      ).toEqual({
        enabled: false,
        apiBaseUrl: DEFAULT_PRODUCTION_API_URL,
      });

      expect(
        resolveDevTestAuthConfig({
          allowDevTestAuth: "false",
          apiUrl: "http://127.0.0.1:8787",
        })
      ).toEqual({
        enabled: false,
        apiBaseUrl: DEFAULT_PRODUCTION_API_URL,
      });

      expect(
        resolveDevTestAuthConfig({
          allowDevTestAuth: "true",
        })
      ).toEqual({
        enabled: false,
        apiBaseUrl: DEFAULT_PRODUCTION_API_URL,
      });
    });

    it("enables dev test auth and normalizes trailing slashes when both conditions are met", () => {
      expect(
        resolveDevTestAuthConfig({
          allowDevTestAuth: "true",
          apiUrl: "http://127.0.0.1:8787/",
        })
      ).toEqual({
        enabled: true,
        apiBaseUrl: "http://127.0.0.1:8787",
      });
    });
  });

  describe("production config safety invariants", () => {
    it("ensures mobile/app.json and mobile/eas.json do not define dev test auth env vars", () => {
      for (const raw of [appJsonRaw, easJsonRaw]) {
        expect(raw).not.toContain("EXPO_PUBLIC_ALLOW_DEV_TEST_AUTH");
        expect(raw).not.toContain("EXPO_PUBLIC_API_URL");
      }
    });
  });
});
