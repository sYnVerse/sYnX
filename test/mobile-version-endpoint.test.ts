import { describe, it, expect } from "vitest";
import { loader as versionLoader } from "../app/routes/api.v1.mobile.version";
import { loader as downloadLoader } from "../app/routes/download.android";
import { finalizeWorkerResponse } from "../app/worker-response.server";

function createMockContext(env: Record<string, string | undefined> = {}) {
  return {
    cloudflare: {
      env,
      ctx: {} as any,
    },
  };
}

describe("mobile version API and download routes", () => {
  describe("GET /api/v1/mobile/version", () => {
    it("returns updateRequired: false when client runtime matches current OTA runtime", async () => {
      const request = new Request(
        "https://synx.christran.io/api/v1/mobile/version?platform=android&version=3.8.0&build=29&runtimeVersion=9b83facafc79485ba4e7649aadf56dd10c617724"
      );
      const response = await versionLoader({
        request,
        context: createMockContext(),
        params: {},
      } as any);

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.updateRequired).toBe(false);
      expect(data.reason).toBeNull();
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBeNull();
    });

    it("detects runtime mismatch from headers and returns update headers (Issue #202)", async () => {
      const request = new Request("https://synx.christran.io/api/v1/mobile/version", {
        headers: {
          "X-sYnX-Client-Version": "3.8.0",
          "X-sYnX-Binary-Version": "3.8.0 (29)",
          "X-sYnX-Runtime-Version": "old-pre199-fingerprint",
        },
      });
      const response = await versionLoader({
        request,
        context: createMockContext(),
        params: {},
      } as any);

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.updateRequired).toBe(true);
      expect(data.reason).toBe("runtime_mismatch");
      expect(data.message).toMatch(/Over-The-Air updates are no longer supported/i);
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBe("1");
      expect(response.headers.get("X-sYnX-Native-Update-Url")).toContain("/download/android");
    });

    it("respects Cloudflare environment variable overrides", async () => {
      const request = new Request(
        "https://synx.christran.io/api/v1/mobile/version?platform=android&version=3.7.2&build=29&runtimeVersion=9b83facafc79485ba4e7649aadf56dd10c617724"
      );
      const context = createMockContext({
        MOBILE_MIN_APP_VERSION: "3.9.0",
        MOBILE_DOWNLOAD_URL: "https://custom.synx.io/apk",
        MOBILE_BLOCK_OUTDATED_BUILDS: "true",
      });
      const response = await versionLoader({
        request,
        context,
        params: {},
      } as any);

      const data = (await response.json()) as any;
      expect(data.updateRequired).toBe(true);
      expect(data.isBlocking).toBe(true);
      expect(data.downloadUrl).toBe("https://custom.synx.io/apk");
      expect(data.reason).toBe("version_below_minimum");
    });
  });

  describe("GET /download/android", () => {
    it("redirects (302) to the Expo builds page by default", async () => {
      const request = new Request("https://synx.christran.io/download/android");
      const response = await downloadLoader({
        request,
        context: createMockContext(),
        params: {},
      } as any);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("expo.dev");
    });

    it("redirects to custom ANDROID_DOWNLOAD_URL when configured", async () => {
      const request = new Request("https://synx.christran.io/download/android");
      const context = createMockContext({
        ANDROID_DOWNLOAD_URL: "https://play.google.com/store/apps/details?id=io.christran.synx",
      });
      const response = await downloadLoader({
        request,
        context,
        params: {},
      } as any);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://play.google.com/store/apps/details?id=io.christran.synx"
      );
    });
  });

  describe("worker response middleware header propagation", () => {
    it("attaches update required header to worker responses when request has outdated runtime", () => {
      const request = new Request("https://synx.christran.io/api/v1/todos", {
        headers: {
          "X-sYnX-Client-Version": "3.8.0",
          "X-sYnX-Binary-Version": "3.8.0 (29)",
          "X-sYnX-Runtime-Version": "outdated-fingerprint-123",
        },
      });
      const baseResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const response = finalizeWorkerResponse(request, baseResponse);
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBe("1");
      expect(response.headers.get("X-sYnX-Native-Update-Url")).toContain("/download/android");
    });

    it("does not attach update required header when request runtime is up to date", () => {
      const request = new Request("https://synx.christran.io/api/v1/todos", {
        headers: {
          "X-sYnX-Client-Version": "3.8.0",
          "X-sYnX-Binary-Version": "3.8.0 (29)",
          "X-sYnX-Runtime-Version": "9b83facafc79485ba4e7649aadf56dd10c617724",
        },
      });
      const baseResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const response = finalizeWorkerResponse(request, baseResponse);
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBeNull();
    });
  });
});
