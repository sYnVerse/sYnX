import { createContext } from "react-router";
import type { PlatformProxy } from "wrangler";

export interface CloudflarePlatformContext {
  env: Env;
  ctx: ExecutionContext;
  cf?: Request["cf"];
  caches?: CacheStorage | PlatformProxy<Env>["caches"];
}

export const cloudflareContext = createContext<CloudflarePlatformContext>();

export function getCloudflareContext(context: unknown): CloudflarePlatformContext {
  if (context && typeof (context as { get?: unknown }).get === "function") {
    const val = (context as { get: (key: unknown) => CloudflarePlatformContext }).get(cloudflareContext);
    if (val) return val;
  }
  const legacy = context as { cloudflare?: CloudflarePlatformContext } | undefined;
  if (legacy?.cloudflare) {
    return legacy.cloudflare;
  }
  throw new Error("Cloudflare context is not available in current request context");
}
