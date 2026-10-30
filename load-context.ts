import { type PlatformProxy } from "wrangler";

type GetLoadContextArgs = {
  request: Request;
  context: {
    cloudflare: Omit<PlatformProxy<Env>, "dispose" | "caches" | "cf"> & {
      caches: PlatformProxy<Env>["caches"] | CacheStorage;
      cf: Request["cf"];
    };
  };
};

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

declare module "@remix-run/cloudflare" {
  interface AppLoadContext extends ReturnType<typeof getLoadContext> {
    // This will merge the result of `getLoadContext` into the `AppLoadContext`
  }
}

export function getLoadContext({ context }: GetLoadContextArgs) {
  return context;
}
