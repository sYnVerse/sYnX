import type { Route } from "./+types/download.android";
import { getCloudflareContext } from "~/context.server";
import { DEFAULT_NATIVE_UPDATE_CONFIG } from "../../shared";

const EXPO_BUILDS_PAGE = "https://expo.dev/accounts/chris-tran/projects/synx/builds";

function tryGetEnv(context: unknown): Record<string, string | undefined> | null {
  try {
    return (getCloudflareContext(context).env as unknown as Record<string, string | undefined>) ?? null;
  } catch {
    return null;
  }
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = tryGetEnv(context);
  const targetUrl =
    env?.ANDROID_DOWNLOAD_URL ||
    env?.MOBILE_DOWNLOAD_URL ||
    DEFAULT_NATIVE_UPDATE_CONFIG.android?.downloadUrl ||
    EXPO_BUILDS_PAGE;

  // If downloadUrl is self, redirect to the Expo builds page
  const destination =
    targetUrl.includes("/download/android")
      ? EXPO_BUILDS_PAGE
      : targetUrl;

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "public, max-age=300",
    },
  });
}
