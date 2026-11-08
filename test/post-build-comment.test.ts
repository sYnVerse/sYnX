import { describe, it, expect, vi, beforeEach } from "vitest";
import { body, main } from "../mobile/scripts/post-build-comment.js";

describe("post-build-comment script", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("body() - Over-The-Air (OTA) updates", () => {
    it("formats successful OTA update comment with channel, update ID, runtime version, and Settings note", () => {
      const output = body({
        UPDATE_ID: "grp-456-abc",
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

    it("falls back to FINGERPRINT_HASH when RUNTIME_VERSION is absent", () => {
      const output = body({
        UPDATE_ID: "grp-789-xyz",
        FINGERPRINT_HASH: "hash-from-fingerprint-job",
        COMMIT_SHA: "1234567890abcdef",
      });

      expect(output).toContain("- **Channel**: `preview`");
      expect(output).toContain("- **Runtime Version**: `hash-from-fingerprint-job`");
      expect(output).toContain("- **Update Group ID**: `grp-789-xyz`");
      expect(output).toContain("Commit `1234567`");
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
        "**[Open build page to install or download the APK](https://expo.dev/accounts/chris-tran/projects/synx/builds/bld-555-666)**"
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

  describe("main() graceful skips", () => {
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
  });
});
