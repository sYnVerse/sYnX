import type { Route } from "./+types/api.v1.mobile.version";
import { getCloudflareContext } from "~/context.server";
import {
  DEFAULT_NATIVE_UPDATE_CONFIG,
  checkNativeUpdateRequired,
  type NativePlatformConfig,
  type NativeUpdateClientContext,
} from "../../shared";

function tryGetEnv(context: unknown): Record<string, string | undefined> | null {
  try {
    return (getCloudflareContext(context).env as unknown as Record<string, string | undefined>) ?? null;
  } catch {
    return null;
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") || "android";
  const appVersion =
    url.searchParams.get("version") ||
    request.headers.get("X-sYnX-Client-Version") ||
    null;
  const buildVersion =
    url.searchParams.get("build") ||
    url.searchParams.get("binaryVersion") ||
    request.headers.get("X-sYnX-Binary-Version") ||
    null;
  const runtimeVersion =
    url.searchParams.get("runtimeVersion") ||
    request.headers.get("X-sYnX-Runtime-Version") ||
    null;

  const env = tryGetEnv(context);
  const baseConfig = DEFAULT_NATIVE_UPDATE_CONFIG[platform] || DEFAULT_NATIVE_UPDATE_CONFIG.android;

  const effectiveConfig: NativePlatformConfig = {
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
    downloadUrl: env?.MOBILE_DOWNLOAD_URL || env?.ANDROID_DOWNLOAD_URL || baseConfig.downloadUrl,
    isBlocking: env?.MOBILE_BLOCK_OUTDATED_BUILDS === "true" || baseConfig.isBlocking,
  };

  const client: NativeUpdateClientContext = {
    platform,
    appVersion,
    buildVersion,
    runtimeVersion,
  };

  const evaluation = checkNativeUpdateRequired(client, effectiveConfig);

  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=60, s-maxage=300",
  };
  if (evaluation.updateRequired) {
    headers["X-sYnX-Native-Update-Required"] = "1";
    headers["X-sYnX-Native-Update-Url"] = evaluation.downloadUrl;
  }

  return Response.json(
    {
      ...evaluation,
      current: {
        appVersion,
        buildVersion,
        runtimeVersion,
      },
      latest: effectiveConfig,
    },
    { headers }
  );
}
