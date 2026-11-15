import { describe, it, expect } from "vitest";
import {
  parseSemVer,
  compareSemVer,
  parseBuildNumber,
  isNativeUpdateDismissed,
  checkNativeUpdateRequired,
  resolveNativeUpdateConfig,
  DEFAULT_NATIVE_UPDATE_CONFIG,
  NATIVE_UPDATE_DISMISS_BACKOFF_MS,
  type NativePlatformConfig,
} from "../shared/native-update";

describe("shared/native-update", () => {
  describe("parseSemVer", () => {
    it("parses valid semver strings with or without leading v", () => {
      expect(parseSemVer("3.8.0")).toEqual([3, 8, 0]);
      expect(parseSemVer("v3.8.0")).toEqual([3, 8, 0]);
      expect(parseSemVer("1.2.3-alpha.1")).toEqual([1, 2, 3]);
    });

    it("returns null for invalid or missing inputs", () => {
      expect(parseSemVer(null)).toBeNull();
      expect(parseSemVer(undefined)).toBeNull();
      expect(parseSemVer("")).toBeNull();
      expect(parseSemVer("invalid")).toBeNull();
    });
  });

  describe("compareSemVer", () => {
    it("correctly identifies equal versions", () => {
      expect(compareSemVer("3.8.0", "3.8.0")).toBe(0);
      expect(compareSemVer("v3.8.0", "3.8.0")).toBe(0);
      expect(compareSemVer("1.0.0", "v1.0.0")).toBe(0);
    });

    it("orders by major, minor, then patch", () => {
      expect(compareSemVer("4.0.0", "3.9.9")).toBe(1);
      expect(compareSemVer("3.9.9", "4.0.0")).toBe(-1);
      expect(compareSemVer("3.8.0", "3.7.2")).toBe(1);
      expect(compareSemVer("3.7.1", "3.7.2")).toBe(-1);
      expect(compareSemVer("3.7.2", "3.7.1")).toBe(1);
    });

    it("handles null/unparseable values safely", () => {
      expect(compareSemVer(null, "1.0.0")).toBe(-1);
      expect(compareSemVer("1.0.0", null)).toBe(1);
      expect(compareSemVer(null, null)).toBe(0);
    });
  });

  describe("parseBuildNumber", () => {
    it("parses pure integers", () => {
      expect(parseBuildNumber(29)).toBe(29);
      expect(parseBuildNumber("29")).toBe(29);
      expect(parseBuildNumber("105")).toBe(105);
    });

    it("extracts build number from formatted string 'version (build)'", () => {
      expect(parseBuildNumber("3.7.2 (29)")).toBe(29);
      expect(parseBuildNumber("v3.8.0 (42)")).toBe(42);
      expect(parseBuildNumber("(99)")).toBe(99);
    });

    it("returns null for invalid or missing inputs", () => {
      expect(parseBuildNumber(null)).toBeNull();
      expect(parseBuildNumber(undefined)).toBeNull();
      expect(parseBuildNumber("")).toBeNull();
      expect(parseBuildNumber("3.7.2")).toBeNull(); // Does not corrupt semver to 372
      expect(parseBuildNumber("invalid")).toBeNull();
    });
  });

  describe("isNativeUpdateDismissed", () => {
    it("returns true when dismissed within the backoff period", () => {
      const now = 1000000;
      const dismissedAt = now - 1000; // 1 second ago
      expect(isNativeUpdateDismissed(dismissedAt, now)).toBe(true);
    });

    it("returns false when the backoff period has elapsed", () => {
      const now = 100000000;
      const dismissedAt = now - NATIVE_UPDATE_DISMISS_BACKOFF_MS - 1;
      expect(isNativeUpdateDismissed(dismissedAt, now)).toBe(false);
    });

    it("returns false when never dismissed or invalid", () => {
      expect(isNativeUpdateDismissed(null)).toBe(false);
      expect(isNativeUpdateDismissed(undefined)).toBe(false);
      expect(isNativeUpdateDismissed(NaN)).toBe(false);
    });
  });

  describe("checkNativeUpdateRequired", () => {
    const config: NativePlatformConfig = {
      latestVersion: "3.8.0",
      minVersion: "3.7.2",
      latestBuildVersion: 29,
      minBuildVersion: 29,
      latestRuntimeVersion: "fingerprint-active-hash",
      supportedRuntimeVersions: ["fingerprint-active-hash"],
      downloadUrl: "https://synx.christran.io/download/android",
      isBlocking: false,
    };

    it("returns updateRequired: false for web platform", () => {
      const result = checkNativeUpdateRequired(
        { platform: "web", appVersion: "1.0.0", runtimeVersion: "old" },
        config
      );
      expect(result.updateRequired).toBe(false);
    });

    it("flags version_below_minimum when SemVer is older than minVersion", () => {
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.7.0", buildVersion: "29", runtimeVersion: "fingerprint-active-hash" },
        config
      );
      expect(result.updateRequired).toBe(true);
      expect(result.reason).toBe("version_below_minimum");
    });

    it("flags build_below_minimum when buildVersion is below minBuildVersion", () => {
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.7.2", buildVersion: "28", runtimeVersion: "fingerprint-active-hash" },
        config
      );
      expect(result.updateRequired).toBe(true);
      expect(result.reason).toBe("build_below_minimum");
    });

    it("correctly parses parenthesized build version '3.7.2 (28)' and flags build_below_minimum", () => {
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.7.2", buildVersion: "3.7.2 (28)", runtimeVersion: "fingerprint-active-hash" },
        config
      );
      expect(result.updateRequired).toBe(true);
      expect(result.reason).toBe("build_below_minimum");
    });

    it("flags runtime_mismatch when runtime is in deprecatedRuntimeVersions (Issue #202)", () => {
      const deprecatingConfig: NativePlatformConfig = {
        ...config,
        deprecatedRuntimeVersions: ["fingerprint-old-pre199"],
      };
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.8.0", buildVersion: "29", runtimeVersion: "fingerprint-old-pre199" },
        deprecatingConfig
      );
      expect(result.updateRequired).toBe(true);
      expect(result.reason).toBe("runtime_mismatch");
      expect(result.message).toMatch(/Over-The-Air updates are no longer supported/i);
    });

    it("flags runtime_mismatch when client without build number has unsupported runtime fingerprint", () => {
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.7.2", runtimeVersion: "fingerprint-old-pre199" },
        config
      );
      expect(result.updateRequired).toBe(true);
      expect(result.reason).toBe("runtime_mismatch");
    });

    it("treats unknown or newer runtime fingerprint on build at or above floor as OK", () => {
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.8.0", buildVersion: "30", runtimeVersion: "future-native-hash" },
        config
      );
      expect(result.updateRequired).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("returns updateRequired: false when binary meets all floor requirements and matches runtime fingerprint", () => {
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.8.0", buildVersion: "29", runtimeVersion: "fingerprint-active-hash" },
        config
      );
      expect(result.updateRequired).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("respects isBlocking flag from config", () => {
      const blockingConfig: NativePlatformConfig = {
        ...config,
        isBlocking: true,
      };
      const result = checkNativeUpdateRequired(
        { platform: "android", appVersion: "3.5.0", buildVersion: "10" },
        blockingConfig
      );
      expect(result.updateRequired).toBe(true);
      expect(result.isBlocking).toBe(true);
    });
  });

  describe("resolveNativeUpdateConfig", () => {
    it("falls back to default android config with no env overrides", () => {
      const resolved = resolveNativeUpdateConfig("android", null);
      expect(resolved.latestVersion).toBe("3.9.0");
      expect(resolved.minVersion).toBe("3.8.0");
      expect(resolved.minBuildVersion).toBe(30);
      expect(resolved.downloadUrl).toContain("/download/android");
    });

    it("applies environment overrides for versions and runtimes", () => {
      const resolved = resolveNativeUpdateConfig("android", {
        MOBILE_MIN_APP_VERSION: "3.9.0",
        MOBILE_MIN_BUILD_VERSION: "35",
        MOBILE_DEPRECATED_RUNTIME_VERSIONS: "bad-hash-1, bad-hash-2",
        MOBILE_DOWNLOAD_URL: "https://custom.apk/download",
        MOBILE_BLOCK_OUTDATED_BUILDS: "true",
      });
      expect(resolved.minVersion).toBe("3.9.0");
      expect(resolved.minBuildVersion).toBe(35);
      expect(resolved.deprecatedRuntimeVersions).toEqual(["bad-hash-1", "bad-hash-2"]);
      expect(resolved.downloadUrl).toBe("https://custom.apk/download");
      expect(resolved.isBlocking).toBe(true);
    });
  });

  describe("DEFAULT_NATIVE_UPDATE_CONFIG", () => {
    it("defines android configuration targeting minimum build 30 and version 3.8.0", () => {
      const android = DEFAULT_NATIVE_UPDATE_CONFIG.android;
      expect(android).toBeDefined();
      expect(android.latestVersion).toBe("3.9.0");
      expect(android.minVersion).toBe("3.8.0");
      expect(android.minBuildVersion).toBe(30);
      expect(android.downloadUrl).toContain("/download/android");
    });
  });
});
