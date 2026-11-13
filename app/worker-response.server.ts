import { getRefreshedCookies } from "./auth.server";
import { applySecurityHeaders } from "./security-headers";
import {
  resolveNativeUpdateConfig,
  checkNativeUpdateRequired,
  parseBuildNumber,
  type NativeUpdateClientContext,
} from "../shared";

/**
 * Checks diagnostic mobile headers (X-sYnX-Platform, X-sYnX-Runtime-Version,
 * X-sYnX-Client-Version, X-sYnX-Build-Number / X-sYnX-Binary-Version)
 * and determines if a native binary upgrade is required because OTAs are no longer supported.
 * Only evaluates Android clients (skips when platform is missing or non-Android).
 */
export function evaluateNativeUpdateHeaders(
  request: Request,
  env?: Record<string, string | undefined> | null
): {
  required: boolean;
  downloadUrl?: string;
} {
  const platform = (
    request.headers.get("X-sYnX-Platform") ||
    new URL(request.url).searchParams.get("platform") ||
    ""
  ).toLowerCase();

  // Non-Android platforms (or web/unspecified callers) do not use native APK prompts
  if (platform !== "android") {
    return { required: false };
  }

  const runtimeVersion = request.headers.get("X-sYnX-Runtime-Version");
  const appVersion = request.headers.get("X-sYnX-Client-Version");
  const rawBuild =
    request.headers.get("X-sYnX-Build-Number") ||
    request.headers.get("X-sYnX-Binary-Version");
  const buildVersion = parseBuildNumber(rawBuild);

  if (!runtimeVersion && !appVersion && buildVersion == null) {
    return { required: false };
  }

  const client: NativeUpdateClientContext = {
    platform: "android",
    appVersion,
    buildVersion,
    runtimeVersion,
  };

  const effectiveConfig = resolveNativeUpdateConfig("android", env);
  const evalResult = checkNativeUpdateRequired(client, effectiveConfig);

  return {
    required: evalResult.updateRequired,
    downloadUrl: evalResult.downloadUrl,
  };
}

/**
 * Wraps the Remix response for the worker: adds the security headers and any
 * session cookies refreshed while handling `request`.
 */
export function finalizeWorkerResponse(
  request: Request,
  response: Response,
  env?: unknown
): Response {
  const headers = applySecurityHeaders(new Headers(response.headers));
  const refreshedCookies = getRefreshedCookies(request);
  for (const cookie of refreshedCookies) {
    headers.append("Set-Cookie", cookie);
  }

  const nativeCheck = evaluateNativeUpdateHeaders(
    request,
    (env as Record<string, string | undefined>) ?? null
  );
  if (nativeCheck.required) {
    headers.set("X-sYnX-Native-Update-Required", "1");
    if (nativeCheck.downloadUrl) {
      headers.set("X-sYnX-Native-Update-Url", nativeCheck.downloadUrl);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** The worker's response when handling a request throws. */
export function unexpectedErrorResponse(): Response {
  return new Response("An unexpected error occurred", {
    status: 500,
    headers: applySecurityHeaders(new Headers()),
  });
}
