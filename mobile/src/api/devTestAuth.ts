export const DEFAULT_PRODUCTION_API_URL = "https://synx.christran.io";

export interface DevTestAuthConfig {
  enabled: boolean;
  apiBaseUrl: string;
}

/**
 * Returns true only for local http:// loopback origins so local E2E overrides
 * can never redirect traffic to remote or non-loopback endpoints.
 */
export function isAllowedLoopbackApiUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function resolveDevTestAuthConfig(input: {
  allowDevTestAuth?: string;
  apiUrl?: string;
}): DevTestAuthConfig {
  if (input.allowDevTestAuth === "true" && isAllowedLoopbackApiUrl(input.apiUrl)) {
    const normalized = input.apiUrl!.trim().replace(/\/+$/, "");
    return {
      enabled: true,
      apiBaseUrl: normalized,
    };
  }
  return {
    enabled: false,
    apiBaseUrl: DEFAULT_PRODUCTION_API_URL,
  };
}

export function getRuntimeDevTestAuthConfig(): DevTestAuthConfig {
  return resolveDevTestAuthConfig({
    allowDevTestAuth: process.env.EXPO_PUBLIC_ALLOW_DEV_TEST_AUTH,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  });
}

export const DEV_TEST_AUTH_ENABLED = getRuntimeDevTestAuthConfig().enabled;
