import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  body,
  main,
  parseUpdateRuntimeVersion,
  normalizePrivateKey,
  createAppJwt,
  getInstallationToken,
} from "../mobile/scripts/post-build-comment.js";

function derToPem(der: ArrayBuffer, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

async function generateEphemeralRsaPemPair(): Promise<{ privateKey: string; publicKey: string }> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const [pkcs8, spki] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
    crypto.subtle.exportKey("spki", pair.publicKey),
  ]);
  return {
    privateKey: derToPem(pkcs8, "PRIVATE KEY"),
    publicKey: derToPem(spki, "PUBLIC KEY"),
  };
}

describe("post-build-comment script", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseUpdateRuntimeVersion", () => {
    it("parses runtimeVersion from updates_json array string", () => {
      const jsonStr = JSON.stringify([
        { id: "up-1", runtimeVersion: "runtime-hash-123", group: "grp-1" },
      ]);
      expect(parseUpdateRuntimeVersion(jsonStr)).toBe("runtime-hash-123");
    });

    it("parses runtimeVersion from updates_json object", () => {
      expect(parseUpdateRuntimeVersion({ runtimeVersion: "obj-runtime-456" })).toBe("obj-runtime-456");
    });

    it("returns null for empty, invalid, or missing updates_json", () => {
      expect(parseUpdateRuntimeVersion(null)).toBeNull();
      expect(parseUpdateRuntimeVersion("")).toBeNull();
      expect(parseUpdateRuntimeVersion("invalid-json")).toBeNull();
      expect(parseUpdateRuntimeVersion("[]")).toBeNull();
    });
  });

  describe("body() - Over-The-Air (OTA) updates", () => {
    it("formats successful OTA update comment with channel, update ID, runtime version, and Settings note", () => {
      const output = body({
        UPDATE_ID: "grp-456-abc",
        UPDATES_JSON: JSON.stringify([{ runtimeVersion: "96f181b3dda58a5e307683b2593458d40c72a86c" }]),
        UPDATE_CHANNEL: "preview",
        RUNTIME_VERSION: "96f181b3dda58a5e307683b2593458d40c72a86c",
        COMMIT_SHA: "abcdef1234567890",
        MATCHED_BUILD_ID: "build-111-222",
      });

      expect(output).toContain("### 🚀 Over-The-Air (OTA) preview update published");
      expect(output).toContain("- **Channel**: `preview`");
      expect(output).toContain("- **Runtime Version**: `96f181b3dda58a5e307683b2593458d40c72a86c`");
      expect(output).toContain("- **Update Group ID**: `grp-456-abc`");
      expect(output).toContain("- **Base Preview Build**: [build-11](https://expo.dev/accounts/chris-tran/projects/synx/builds/build-111-222)");
      expect(output).toContain(
        "Devices running the preview build will automatically receive this update on next app launch, or you can check immediately via **Settings > About & Release Notes > Check for updates**."
      );
      expect(output).toContain("Commit `abcdef1`");
    });

    it("uses published runtime from UPDATES_JSON even if RUNTIME_VERSION is absent", () => {
      const output = body({
        UPDATE_ID: "grp-789-xyz",
        UPDATES_JSON: JSON.stringify([{ runtimeVersion: "published-runtime-hash" }]),
        FINGERPRINT_HASH: "published-runtime-hash",
        COMMIT_SHA: "1234567890abcdef",
      });

      expect(output).toContain("- **Channel**: `preview`");
      expect(output).toContain("- **Runtime Version**: `published-runtime-hash`");
      expect(output).toContain("- **Update Group ID**: `grp-789-xyz`");
      expect(output).toContain("Commit `1234567`");
    });

    it("flags runtime version mismatch if published runtime differs from native preview APK fingerprint", () => {
      const output = body({
        UPDATE_ID: "grp-mismatch",
        UPDATES_JSON: JSON.stringify([{ runtimeVersion: "runtime-without-google-services" }]),
        FINGERPRINT_HASH: "runtime-with-google-services",
        COMMIT_SHA: "abcdef123456",
      });

      expect(output).toContain("### ⚠️ Over-The-Air (OTA) runtime version mismatch");
      expect(output).toContain("- **Published Runtime**: `runtime-without-google-services`");
      expect(output).toContain("- **Expected Runtime (Preview APK)**: `runtime-with-google-services`");
      expect(output).toContain("The published update targets a runtime version that does not match the native preview APK");
    });

    it("formats OTA update failure comment with workflow link", () => {
      const output = body({
        UPDATE_STATUS: "failure",
        WORKFLOW_URL: "https://expo.dev/accounts/chris-tran/projects/synx/workflows/wf-999",
        FINGERPRINT_HASH: "fp-fail-hash",
        COMMIT_SHA: "deadbeef123456",
      });

      expect(output).toContain("### ❌ Over-The-Air (OTA) preview update failed");
      expect(output).toContain("[Workflow run](https://expo.dev/accounts/chris-tran/projects/synx/workflows/wf-999)");
      expect(output).toContain("- **Runtime Version**: `fp-fail-hash`");
      expect(output).toContain("Commit `deadbee`");
    });
  });

  describe("body() - Native Android preview APK builds", () => {
    it("formats successful APK build comment with direct link and embedded QR code", () => {
      const output = body({
        BUILD_ID: "bld-555-666",
        BUILD_STATUS: "success",
        APP_VERSION: "3.7.0",
        APP_BUILD_VERSION: "45",
        RUNTIME_VERSION: "native-runtime-abc",
        COMMIT_SHA: "fedcba0987654321",
      });

      expect(output).toContain("### 📱 Android preview build ready v3.7.0 (45)");
      expect(output).toContain(
        "**[Open build page to install or download the APK](${buildUrl})**".replace("${buildUrl}", "https://expo.dev/accounts/chris-tran/projects/synx/builds/bld-555-666")
      );
      expect(output).toContain("https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=");
      expect(output).toContain("![Scan to install APK](");
      expect(output).toContain("Scan the QR code above or open the link on your Android device to install the APK.");
      expect(output).toContain("- Native Runtime Fingerprint: `native-runtime-abc`");
      expect(output).toContain("Commit `fedcba0`");
    });

    it("formats failed APK build comment with build logs and workflow run URL", () => {
      const output = body({
        BUILD_ID: "bld-fail-123",
        BUILD_STATUS: "errored",
        WORKFLOW_URL: "https://expo.dev/workflows/wf-fail",
        RUNTIME_VERSION: "fp-fail",
        COMMIT_SHA: "aaaa111122223333",
      });

      expect(output).toContain("### ❌ Android preview build errored");
      expect(output).toContain("[Build logs](https://expo.dev/accounts/chris-tran/projects/synx/builds/bld-fail-123)");
      expect(output).toContain("[Workflow run](https://expo.dev/workflows/wf-fail)");
      expect(output).toContain("- Native Runtime Fingerprint: `fp-fail`");
      expect(output).toContain("Commit `aaaa111`");
    });
  });

  describe("main() error and skip handling", () => {
    it("skips gracefully when SYNX_GITHUB_COMMENT_TOKEN is missing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await main({});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SYNX_GITHUB_COMMENT_TOKEN not set"));
    });

    it("skips gracefully when COMMIT_SHA is missing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await main({ SYNX_GITHUB_COMMENT_TOKEN: "dummy-token" });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No commit SHA"));
    });

    it("throws error when OTA update runtime mismatch occurs", async () => {
      // Mock global fetch to return dummy pulls and comments response
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => [{ merged_at: "2026-11-08T00:00:00Z", number: 42, html_url: "https://github.com/pull/42" }],
      } as any);

      await expect(
        main({
          SYNX_GITHUB_COMMENT_TOKEN: "dummy-token",
          COMMIT_SHA: "abc1234567890",
          UPDATE_ID: "grp-mismatch",
          UPDATES_JSON: JSON.stringify([{ runtimeVersion: "bad-hash" }]),
          FINGERPRINT_HASH: "good-hash",
        })
      ).rejects.toThrow(/OTA update runtime mismatch/);

      fetchSpy.mockRestore();
    });
  });

  describe("GitHub App JWT & installation token authentication (#189)", () => {
    it("normalizes escaped \\n sequences in PEM private keys", () => {
      const normalized = normalizePrivateKey("line1\\nline2\\nline3  ");
      expect(normalized).toBe("line1\nline2\nline3");
    });

    it("signs a valid RS256 JWT with issuer, iat, and exp claims", async () => {
      const { privateKey, publicKey } = await generateEphemeralRsaPemPair();
      const escapedPem = privateKey.replace(/\n/g, "\\n");
      const nowSec = 1_700_000_000;

      const jwt = createAppJwt("123456", escapedPem, nowSec);
      const parts = jwt.split(".");
      expect(parts).toHaveLength(3);

      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      expect(header).toEqual({ alg: "RS256", typ: "JWT" });
      expect(payload).toEqual({
        iss: "123456",
        iat: nowSec - 60,
        exp: nowSec + 9 * 60,
      });

      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(`${parts[0]}.${parts[1]}`);
      verifier.end();
      expect(verifier.verify(publicKey, Buffer.from(parts[2], "base64url"))).toBe(true);
    });

    it("resolves installation dynamically and exchanges JWT for an installation token", async () => {
      const { privateKey } = await generateEphemeralRsaPemPair();
      const calls: { url: string; method?: string; auth?: string }[] = [];

      const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        calls.push({ url, method: init?.method, auth: headers?.Authorization });

        if (url === "https://api.github.com/repos/sYnVerse/sYnX/installation") {
          return new Response(JSON.stringify({ id: 987654 }), { status: 200 });
        }
        if (url === "https://api.github.com/app/installations/987654/access_tokens") {
          return new Response(JSON.stringify({ token: "ghs_app_install_tok" }), { status: 201 });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      }) as unknown as typeof fetch;

      const result = await getInstallationToken(
        {
          SYNX_GITHUB_APP_ID: "555111",
          SYNX_GITHUB_APP_PRIVATE_KEY: privateKey,
        },
        mockFetch
      );

      expect(result).toEqual({ token: "ghs_app_install_tok", source: "github-app" });
      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].auth).toMatch(/^Bearer eyJ/);
      expect(calls[1].method).toBe("POST");
      expect(calls[1].auth).toBe(calls[0].auth);
    });

    it("uses static SYNX_GITHUB_APP_INSTALLATION_ID without calling /installation", async () => {
      const { privateKey } = await generateEphemeralRsaPemPair();
      const urls: string[] = [];

      const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return new Response(JSON.stringify({ token: "ghs_static_tok" }), { status: 201 });
      }) as unknown as typeof fetch;

      const result = await getInstallationToken(
        {
          GITHUB_APP_ID: "555111",
          GITHUB_APP_PRIVATE_KEY: privateKey,
          SYNX_GITHUB_APP_INSTALLATION_ID: "424242",
        },
        mockFetch
      );

      expect(result).toEqual({ token: "ghs_static_tok", source: "github-app" });
      expect(urls).toEqual(["https://api.github.com/app/installations/424242/access_tokens"]);
    });

    it("falls back to SYNX_GITHUB_COMMENT_TOKEN when App ID or key is absent", async () => {
      const mockFetch = vi.fn() as unknown as typeof fetch;
      const result = await getInstallationToken(
        {
          SYNX_GITHUB_APP_ID: "555111",
          SYNX_GITHUB_COMMENT_TOKEN: "github_pat_fallback",
        },
        mockFetch
      );

      expect(result).toEqual({ token: "github_pat_fallback", source: "pat" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses the exchanged installation token when posting PR comments in main()", async () => {
      const { privateKey } = await generateEphemeralRsaPemPair();
      const requestLog: { url: string; auth?: string }[] = [];

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        requestLog.push({ url, auth: headers?.Authorization });

        if (url === "https://api.github.com/app/installations/777/access_tokens") {
          return new Response(JSON.stringify({ token: "ghs_exchanged_token" }), { status: 201 });
        }
        if (url === "https://api.github.com/repos/sYnVerse/sYnX/commits/deadbeef1234/pulls") {
          return new Response(JSON.stringify([{ number: 99, merged_at: "2026-11-20T00:00:00Z" }]), {
            status: 200,
          });
        }
        if (url === "https://api.github.com/repos/sYnVerse/sYnX/issues/99/comments") {
          return new Response(
            JSON.stringify({ html_url: "https://github.com/sYnVerse/sYnX/pull/99#issuecomment-1" }),
            { status: 201 }
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      await main({
        SYNX_GITHUB_APP_ID: "12345",
        SYNX_GITHUB_APP_PRIVATE_KEY: privateKey,
        SYNX_GITHUB_APP_INSTALLATION_ID: "777",
        SYNX_GITHUB_COMMENT_TOKEN: "pat-should-not-be-used",
        COMMIT_SHA: "deadbeef1234",
        UPDATE_ID: "grp-1",
        UPDATES_JSON: JSON.stringify([{ runtimeVersion: "fp-1" }]),
        FINGERPRINT_HASH: "fp-1",
      });

      expect(requestLog.map((r) => r.url)).toEqual([
        "https://api.github.com/app/installations/777/access_tokens",
        "https://api.github.com/repos/sYnVerse/sYnX/commits/deadbeef1234/pulls",
        "https://api.github.com/repos/sYnVerse/sYnX/issues/99/comments",
      ]);
      expect(requestLog[0].auth).toMatch(/^Bearer eyJ/);
      expect(requestLog[1].auth).toBe("Bearer ghs_exchanged_token");
      expect(requestLog[2].auth).toBe("Bearer ghs_exchanged_token");
      fetchSpy.mockRestore();
    });

    it("throws when GitHub App installation token exchange returns an HTTP error", async () => {
      const { privateKey } = await generateEphemeralRsaPemPair();
      const mockFetch = vi.fn(async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;

      await expect(
        getInstallationToken(
          {
            SYNX_GITHUB_APP_ID: "12345",
            SYNX_GITHUB_APP_PRIVATE_KEY: privateKey,
            SYNX_GITHUB_APP_INSTALLATION_ID: "777",
          },
          mockFetch
        )
      ).rejects.toThrow(/401 Unauthorized/);
    });
  });
});
