import { getRefreshedCookies } from "./auth.server";
import { applySecurityHeaders } from "./security-headers";
import {
  DEFAULT_NATIVE_UPDATE_CONFIG,
  checkNativeUpdateRequired,
  type NativeUpdateClientContext,
} from "../shared";

/**
 * Checks diagnostic mobile headers (X-sYnX-Runtime-Version, X-sYnX-Client-Version, X-sYnX-Binary-Version)
 * and determines if a native binary upgrade is required because OTAs are no longer supported.
 */
export function evaluateNativeUpdateHeaders(request: Request): {
  required: boolean;
  downloadUrl?: string;
} {
  const runtimeVersion = request.headers.get("X-sYnX-Runtime-Version");
  const appVersion = request.headers.get("X-sYnX-Client-Version");
  const buildVersion = request.headers.get("X-sYnX-Binary-Version");

  if (!runtimeVersion && !appVersion && !buildVersion) {
    return { required: false };
  }

  const client: NativeUpdateClientContext = {
    platform: "android",
    appVersion,
    buildVersion,
    runtimeVersion,
  };

  const evalResult = checkNativeUpdateRequired(client, DEFAULT_NATIVE_UPDATE_CONFIG.android);
  return {
    required: evalResult.updateRequired,
    downloadUrl: evalResult.downloadUrl,
  };
}

/**
 * Wraps the Remix response for the worker: adds the security headers and any
 * session cookies refreshed while handling `request`.
 */
export function finalizeWorkerResponse(request: Request, response: Response): Response {
  const headers = applySecurityHeaders(new Headers(response.headers));
  const refreshedCookies = getRefreshedCookies(request);
  for (const cookie of refreshedCookies) {
    headers.append("Set-Cookie", cookie);
  }

  const nativeCheck = evaluateNativeUpdateHeaders(request);
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
