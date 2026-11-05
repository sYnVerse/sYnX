import { RouterContextProvider } from "react-router";
import type { PlatformProxy } from "wrangler";
import { cloudflareContext } from "./app/context.server";

declare global {
  interface Env {
    CLIENT_ID_MAP?: string | Record<string, string>;
    OPENAUTH_ISSUER?: string;
    SYNX_ALLOWED_CLIENT_IDS?: string;
    SYNID_CLIENT_ID?: string;
    SYNID_CLIENT_SECRET?: string;
    SYNID_ISSUER?: string;
    RESEND_API_KEY?: string;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_FROM_NUMBER?: string;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  }
}

export type GetLoadContextArgs = {
  request: Request;
  context: {
    cloudflare: Omit<PlatformProxy<Env>, "dispose" | "caches" | "cf"> & {
      caches: PlatformProxy<Env>["caches"] | CacheStorage;
      cf?: Request["cf"];
    };
  };
};

export function getLoadContext({ context }: GetLoadContextArgs): RouterContextProvider {
  const routerContext = new RouterContextProvider();
  routerContext.set(cloudflareContext, {
    env: context.cloudflare.env,
    ctx: context.cloudflare.ctx,
    cf: context.cloudflare.cf,
    caches: context.cloudflare.caches,
  });
  return routerContext;
}
