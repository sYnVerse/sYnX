import {
  createContext,
  type MiddlewareFunction,
  type RouterContextProvider,
} from "react-router";
import {
  getOptionalUser,
  verifyBearerToken,
  type OptionalUserResult,
} from "./auth.server";
import { getCloudflareContext } from "./context.server";

export interface VerifiedBearerUser {
  userId: string;
  email: string;
  token: string;
}

export interface ApiAuthContextValue {
  user: VerifiedBearerUser | null;
}

/**
 * Request-scoped React Router context populated by `authMiddleware` so web
 * list routes resolve cookies / guest fallback once per request.
 */
export const webAuthContext = createContext<OptionalUserResult | null>(null);

/**
 * Request-scoped React Router context populated by `authMiddleware` so
 * `/api/v1/*` handlers read the verified bearer/cookie user without re-verifying.
 */
export const apiAuthContext = createContext<ApiAuthContextValue | null>(null);

const PUBLIC_API_PATHS = new Set([
  "/api/v1/mobile/version",
  "/api/v1/dev/test-login",
]);

const SKIP_WEB_AUTH_PREFIXES = [
  "/login",
  "/callback",
  "/logout",
  "/mobile/callback",
  "/download/android",
];

function isContextProvider(context: unknown): context is RouterContextProvider {
  return (
    Boolean(context) &&
    typeof (context as { get?: unknown }).get === "function" &&
    typeof (context as { set?: unknown }).set === "function"
  );
}

/** Returns true for API routes whose handlers read `apiAuthContext`. */
export function shouldResolveApiAuth(pathname: string): boolean {
  if (!pathname.startsWith("/api/v1/")) return false;
  return !PUBLIC_API_PATHS.has(pathname);
}

/** Returns true for SSR / single-fetch web routes that read `webAuthContext`. */
export function shouldResolveWebAuth(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  for (const prefix of SKIP_WEB_AUTH_PREFIXES) {
    if (
      pathname === prefix ||
      pathname === `${prefix}.data` ||
      pathname.startsWith(`${prefix}/`)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Root React Router server middleware: resolves auth/session once per incoming
 * request and stores it via `context.set(...)` for downstream loaders/actions.
 */
export const authMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next
) => {
  const { env } = getCloudflareContext(context);
  const pathname = new URL(request.url).pathname;

  if (shouldResolveApiAuth(pathname)) {
    let user: VerifiedBearerUser | null = null;
    if (request.method === "DELETE" && pathname === "/api/v1/devices") {
      user = await verifyBearerToken(request, env).catch(() => null);
    } else {
      user = await verifyBearerToken(request, env);
    }
    context.set(apiAuthContext, { user });
  } else if (shouldResolveWebAuth(pathname)) {
    const auth = await getOptionalUser(request, env);
    context.set(webAuthContext, auth);
  }

  return next();
};

/**
 * Reads the request's web session / guest identity populated by `authMiddleware`,
 * resolving and caching it once if called directly outside the middleware pipeline.
 */
export async function getRequestWebAuth(
  request: Request,
  context: unknown
): Promise<OptionalUserResult> {
  if (isContextProvider(context)) {
    const existing = context.get(webAuthContext);
    if (existing) return existing;
    const { env } = getCloudflareContext(context);
    const resolved = await getOptionalUser(request, env);
    context.set(webAuthContext, resolved);
    return resolved;
  }
  const { env } = getCloudflareContext(context);
  return getOptionalUser(request, env);
}

/**
 * Reads the request's verified API bearer/cookie identity populated by
 * `authMiddleware`, resolving and caching it once if called directly outside
 * the middleware pipeline.
 */
export async function getRequestApiAuth(
  request: Request,
  context: unknown
): Promise<VerifiedBearerUser | null> {
  if (isContextProvider(context)) {
    const existing = context.get(apiAuthContext);
    if (existing) return existing.user;
    const { env } = getCloudflareContext(context);
    const user = await verifyBearerToken(request, env);
    context.set(apiAuthContext, { user });
    return user;
  }
  const { env } = getCloudflareContext(context);
  return verifyBearerToken(request, env);
}
