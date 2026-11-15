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
    it("returns updateRequired: false when client meets floor requirements", async () => {
      const request = new Request(
        "https://synx.christran.io/api/v1/mobile/version?platform=android&version=3.9.0&build=30"
      );
      const response = await versionLoader({
        request,
        context: createMockContext(),
        params: {},
      } as any);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-cache, no-store");
      const data = (await response.json()) as any;
      expect(data.updateRequired).toBe(false);
      expect(data.reason).toBeNull();
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBeNull();
    });

    it("detects build below minimum from headers and returns update headers (Issue #202)", async () => {
      const request = new Request("https://synx.christran.io/api/v1/mobile/version", {
        headers: {
          "X-sYnX-Platform": "android",
          "X-sYnX-Client-Version": "3.8.0",
          "X-sYnX-Binary-Version": "3.8.0 (29)", // build 29 is below new floor 30
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
      expect(data.reason).toBe("build_below_minimum");
      expect(data.message).toMatch(/newer native build/i);
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBe("1");
      expect(response.headers.get("X-sYnX-Native-Update-Url")).toContain("/download/android");
    });

    it("detects runtime mismatch when runtime is deprecated via environment", async () => {
      const request = new Request("https://synx.christran.io/api/v1/mobile/version", {
        headers: {
          "X-sYnX-Platform": "android",
          "X-sYnX-Client-Version": "3.9.0",
          "X-sYnX-Build-Number": "30",
          "X-sYnX-Runtime-Version": "deprecated-fingerprint-hash",
        },
      });
      const context = createMockContext({
        MOBILE_DEPRECATED_RUNTIME_VERSIONS: "deprecated-fingerprint-hash",
      });
      const response = await versionLoader({
        request,
        context,
        params: {},
      } as any);

      const data = (await response.json()) as any;
      expect(data.updateRequired).toBe(true);
      expect(data.reason).toBe("runtime_mismatch");
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBe("1");
    });

    it("respects Cloudflare environment variable overrides", async () => {
      const request = new Request(
        "https://synx.christran.io/api/v1/mobile/version?platform=android&version=3.7.2&build=29"
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
    it("attaches update required header to worker responses when Android client is below floor", () => {
      const request = new Request("https://synx.christran.io/api/v1/todos", {
        headers: {
          "X-sYnX-Platform": "android",
          "X-sYnX-Client-Version": "3.7.2",
          "X-sYnX-Binary-Version": "3.7.2 (28)", // build 28 is below floor 29
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

    it("honors Cloudflare env overrides in finalizeWorkerResponse", () => {
      const request = new Request("https://synx.christran.io/api/v1/todos", {
        headers: {
          "X-sYnX-Platform": "android",
          "X-sYnX-Client-Version": "3.8.0",
          "X-sYnX-Binary-Version": "3.8.0 (29)",
        },
      });
      const baseResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      // Env raises min build to 35
      const env = { MOBILE_MIN_BUILD_VERSION: "35", MOBILE_DOWNLOAD_URL: "https://custom.apk" };
      const response = finalizeWorkerResponse(request, baseResponse, env);
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBe("1");
      expect(response.headers.get("X-sYnX-Native-Update-Url")).toBe("https://custom.apk");
    });

    it("skips native update header when platform is not android (e.g. iOS or web)", () => {
      const request = new Request("https://synx.christran.io/api/v1/todos", {
        headers: {
          "X-sYnX-Platform": "ios",
          "X-sYnX-Client-Version": "3.7.0",
        },
      });
      const baseResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const response = finalizeWorkerResponse(request, baseResponse);
      expect(response.headers.get("X-sYnX-Native-Update-Required")).toBeNull();
    });

    it("does not attach update required header when Android client is at or above floor", () => {
      const request = new Request("https://synx.christran.io/api/v1/todos", {
        headers: {
          "X-sYnX-Platform": "android",
          "X-sYnX-Client-Version": "3.9.0",
          "X-sYnX-Binary-Version": "3.9.0 (30)",
          "X-sYnX-Runtime-Version": "any-newer-hash",
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
