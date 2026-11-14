import type { Route } from "./+types/api.v1.mobile.version";
import { getCloudflareContext } from "~/context.server";
import {
  resolveNativeUpdateConfig,
  checkNativeUpdateRequired,
  parseBuildNumber,
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
  const platform =
    url.searchParams.get("platform") ||
    request.headers.get("X-sYnX-Platform") ||
    "android";
  const appVersion =
    url.searchParams.get("version") ||
    request.headers.get("X-sYnX-Client-Version") ||
    null;
  const rawBuild =
    url.searchParams.get("build") ||
    url.searchParams.get("binaryVersion") ||
    request.headers.get("X-sYnX-Build-Number") ||
    request.headers.get("X-sYnX-Binary-Version") ||
    null;
  const buildVersion = parseBuildNumber(rawBuild);
  const runtimeVersion =
    url.searchParams.get("runtimeVersion") ||
    request.headers.get("X-sYnX-Runtime-Version") ||
    null;

  const env = tryGetEnv(context);
  const effectiveConfig: NativePlatformConfig = resolveNativeUpdateConfig(platform, env);

  const client: NativeUpdateClientContext = {
    platform,
    appVersion,
    buildVersion,
    runtimeVersion,
  };

  const evaluation = checkNativeUpdateRequired(client, effectiveConfig);

  const headers: Record<string, string> = {
    "Cache-Control": "private, no-cache, no-store",
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
