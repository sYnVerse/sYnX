/**
 * Native App Update & Runtime Fingerprint Compatibility
 *
 * Defines policies, comparison logic, and default floors for determining
 * when an installed native mobile binary must be upgraded because Over-The-Air
 * (OTA) updates are no longer served to its native runtime fingerprint.
 */

export type NativeUpdateReason =
  | "runtime_mismatch"
  | "version_below_minimum"
  | "build_below_minimum";

export interface NativePlatformConfig {
  /** Target / latest native app SemVer (e.g. "3.8.0") */
  latestVersion: string;
  /** Minimum supported native app SemVer (e.g. "3.7.2") */
  minVersion: string;
  /** Target / latest native build version code (e.g. 29 on Android) */
  latestBuildVersion?: number;
  /** Minimum required native build version code */
  minBuildVersion?: number;
  /** The runtime version (fingerprint) currently targeted by active EAS OTAs */
  latestRuntimeVersion?: string;
  /** Minimum acceptable runtime version */
  minRuntimeVersion?: string;
  /** Set of runtime versions still served OTAs (used when build number is unknown or below latest) */
  supportedRuntimeVersions?: string[];
  /** Explicit deny list of deprecated runtime versions */
  deprecatedRuntimeVersions?: string[];
  /** Destination link to download or install the native build */
  downloadUrl: string;
  /** Whether the update is strictly blocking (prevents continuing in-app) */
  isBlocking?: boolean;
  /** User-facing explanation */
  message?: string;
}

export interface NativeUpdateClientContext {
  platform?: string | null;
  appVersion?: string | null;
  buildVersion?: string | number | null;
  runtimeVersion?: string | null;
}

export interface NativeUpdateEvaluation {
  updateRequired: boolean;
  isBlocking: boolean;
  reason: NativeUpdateReason | null;
  message: string | null;
  downloadUrl: string;
  latestVersion: string;
  latestBuildVersion?: number;
  latestRuntimeVersion?: string;
}

/** 24-hour backoff when the user taps "Later" / dismisses the update banner. */
export const NATIVE_UPDATE_DISMISS_BACKOFF_MS = 24 * 60 * 60 * 1000;

/** Storage key for recording the epoch ms when user dismissed the prompt. */
export const NATIVE_UPDATE_DISMISSED_AT_KEY = "synx_native_update_dismissed_at";

export const DEFAULT_NATIVE_UPDATE_CONFIG: Record<string, NativePlatformConfig> = {
  android: {
    latestVersion: "3.8.0",
    minVersion: "3.7.2",
    latestBuildVersion: 29,
    minBuildVersion: 29,
    downloadUrl: "https://synx.christran.io/download/android",
    isBlocking: false,
  },
  ios: {
    latestVersion: "3.8.0",
    minVersion: "3.7.2",
    downloadUrl: "https://synx.christran.io",
    isBlocking: false,
  },
};

/**
 * Resolves effective platform config combining hardcoded defaults with Cloudflare environment overrides.
 */
export function resolveNativeUpdateConfig(
  platform: string = "android",
  env?: Record<string, string | undefined> | null
): NativePlatformConfig {
  const p = platform.toLowerCase() === "ios" ? "ios" : "android";
  const baseConfig = DEFAULT_NATIVE_UPDATE_CONFIG[p] || DEFAULT_NATIVE_UPDATE_CONFIG.android;

  const supportedRuntimesEnv = env?.MOBILE_SUPPORTED_RUNTIME_VERSIONS;
  const supportedRuntimeVersions = supportedRuntimesEnv
    ? supportedRuntimesEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : baseConfig.supportedRuntimeVersions;

  const deprecatedRuntimesEnv = env?.MOBILE_DEPRECATED_RUNTIME_VERSIONS;
  const deprecatedRuntimeVersions = deprecatedRuntimesEnv
    ? deprecatedRuntimesEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : baseConfig.deprecatedRuntimeVersions;

  return {
    ...baseConfig,
    latestVersion: env?.MOBILE_LATEST_APP_VERSION || baseConfig.latestVersion,
    minVersion: env?.MOBILE_MIN_APP_VERSION || baseConfig.minVersion,
    latestBuildVersion: env?.MOBILE_LATEST_BUILD_VERSION
      ? parseInt(env.MOBILE_LATEST_BUILD_VERSION, 10)
      : baseConfig.latestBuildVersion,
    minBuildVersion: env?.MOBILE_MIN_BUILD_VERSION
      ? parseInt(env.MOBILE_MIN_BUILD_VERSION, 10)
      : baseConfig.minBuildVersion,
    latestRuntimeVersion: env?.MOBILE_LATEST_RUNTIME_VERSION || baseConfig.latestRuntimeVersion,
    minRuntimeVersion: env?.MOBILE_MIN_RUNTIME_VERSION || baseConfig.minRuntimeVersion,
    supportedRuntimeVersions,
    deprecatedRuntimeVersions,
    downloadUrl: env?.MOBILE_DOWNLOAD_URL || env?.ANDROID_DOWNLOAD_URL || baseConfig.downloadUrl,
    isBlocking: env?.MOBILE_BLOCK_OUTDATED_BUILDS === "true" || baseConfig.isBlocking,
    message: env?.MOBILE_UPDATE_MESSAGE || baseConfig.message,
  };
}

/**
 * Parses a semantic version string (e.g. "3.8.0" or "v3.8.0") into [major, minor, patch].
 */
export function parseSemVer(v: string | null | undefined): [number, number, number] | null {
  if (!v || typeof v !== "string") return null;
  const clean = v.trim().replace(/^v/, "");
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Compares two SemVer strings.
 * Returns 1 if a > b, -1 if a < b, and 0 if equal or unparseable.
 */
export function compareSemVer(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Parses an integer build number / versionCode from a number or string.
 * Handles pure numbers ("29" -> 29) and formatted versions ("3.7.2 (29)" -> 29).
 */
export function parseBuildNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : null;
  const s = String(v).trim();
  const parenMatch = s.match(/\((\d+)\)/);
  if (parenMatch) {
    const num = parseInt(parenMatch[1], 10);
    return isNaN(num) ? null : num;
  }
  if (/^\d+$/.test(s)) {
    const num = parseInt(s, 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Returns true if the dismiss backoff period (24 hours) is still active.
 */
export function isNativeUpdateDismissed(
  dismissedAt: number | null | undefined,
  now: number = Date.now()
): boolean {
  if (dismissedAt == null || Number.isNaN(dismissedAt)) {
    return false;
  }
  return now - dismissedAt < NATIVE_UPDATE_DISMISS_BACKOFF_MS;
}

/**
 * Pure evaluation function that determines if a native update is required
 * by checking SemVer floor, native build number (versionCode), and runtime fingerprint.
 */
export function checkNativeUpdateRequired(
  client: NativeUpdateClientContext,
  config: NativePlatformConfig
): NativeUpdateEvaluation {
  const defaultDownloadUrl = config.downloadUrl || "https://synx.christran.io/download/android";
  const latestVersion = config.latestVersion;
  const latestBuildVersion = config.latestBuildVersion;
  const latestRuntimeVersion = config.latestRuntimeVersion;
  const isBlocking = Boolean(config.isBlocking);

  if (client.platform === "web") {
    return {
      updateRequired: false,
      isBlocking: false,
      reason: null,
      message: null,
      downloadUrl: defaultDownloadUrl,
      latestVersion,
      latestBuildVersion,
      latestRuntimeVersion,
    };
  }

  // 1. Check SemVer floor
  if (client.appVersion && config.minVersion) {
    if (compareSemVer(client.appVersion, config.minVersion) < 0) {
      return {
        updateRequired: true,
        isBlocking,
        reason: "version_below_minimum",
        message:
          config.message ||
          `sYnX ${config.minVersion} or higher is required. Please install the latest native app build.`,
        downloadUrl: defaultDownloadUrl,
        latestVersion,
        latestBuildVersion,
        latestRuntimeVersion,
      };
    }
  }

  // 2. Check native build number (e.g. Android versionCode)
  const parsedBuild = parseBuildNumber(client.buildVersion);
  if (parsedBuild != null && config.minBuildVersion != null) {
    if (parsedBuild < config.minBuildVersion) {
      return {
        updateRequired: true,
        isBlocking,
        reason: "build_below_minimum",
        message:
          config.message ||
          "A newer native build of sYnX is required. Please install the latest native app update.",
        downloadUrl: defaultDownloadUrl,
        latestVersion,
        latestBuildVersion,
        latestRuntimeVersion,
      };
    }
  }

  // 3. Check runtime version (fingerprint) compatibility
  // Hashes have no natural ordering, so fingerprints are treated as allow/deny lists.
  // Unknown fingerprints on builds at or above the native floor are treated as OK.
  if (client.runtimeVersion && client.runtimeVersion !== "embedded") {
    // 3a. Explicit deny list: always requires update if matched
    if (config.deprecatedRuntimeVersions && config.deprecatedRuntimeVersions.includes(client.runtimeVersion)) {
      return {
        updateRequired: true,
        isBlocking,
        reason: "runtime_mismatch",
        message:
          config.message ||
          "A native app update is required. Over-The-Air updates are no longer supported on this build.",
        downloadUrl: defaultDownloadUrl,
        latestVersion,
        latestBuildVersion,
        latestRuntimeVersion,
      };
    }

    // 3b. If build number / SemVer is below floor or unknown, check supportedRuntimeVersions
    const isAtOrAboveFloor =
      parsedBuild != null &&
      (config.minBuildVersion == null || parsedBuild >= config.minBuildVersion) &&
      (client.appVersion == null || config.minVersion == null || compareSemVer(client.appVersion, config.minVersion) >= 0);

    if (!isAtOrAboveFloor) {
      if (config.supportedRuntimeVersions && config.supportedRuntimeVersions.length > 0) {
        if (!config.supportedRuntimeVersions.includes(client.runtimeVersion)) {
          return {
            updateRequired: true,
            isBlocking,
            reason: "runtime_mismatch",
            message:
              config.message ||
              "A native app update is required. Over-The-Air updates are no longer supported on this build.",
            downloadUrl: defaultDownloadUrl,
            latestVersion,
            latestBuildVersion,
            latestRuntimeVersion,
          };
        }
      } else if (config.latestRuntimeVersion && client.runtimeVersion !== config.latestRuntimeVersion) {
        return {
          updateRequired: true,
          isBlocking,
          reason: "runtime_mismatch",
          message:
            config.message ||
            "A native app update is required. Over-The-Air updates are no longer supported on this build.",
          downloadUrl: defaultDownloadUrl,
          latestVersion,
          latestBuildVersion,
          latestRuntimeVersion,
        };
      }
    }
  }

  return {
    updateRequired: false,
    isBlocking: false,
    reason: null,
    message: null,
    downloadUrl: defaultDownloadUrl,
    latestVersion,
    latestBuildVersion,
    latestRuntimeVersion,
  };
}
