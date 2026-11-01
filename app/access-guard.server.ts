import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { applySecurityHeaders } from "./security-headers";

export function isWorkersDevHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "workers.dev" || lower.endsWith(".workers.dev");
}

export function isWorkersDevRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    return isWorkersDevHostname(url.hostname);
  } catch {
    return false;
  }
}

export function extractAccessJwt(request: Request): string | null {
  const headerJwt = request.headers.get("cf-access-jwt-assertion");
  if (headerJwt && headerJwt.trim()) {
    return headerJwt.trim();
  }
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }
  return null;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

export function getAccessJWKS(teamDomain: string): JWTVerifyGetKey {
  const normalized = teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cached = jwksCache.get(normalized);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`https://${normalized}/cdn-cgi/access/certs`));
  jwksCache.set(normalized, jwks);
  return jwks;
}

export function clearJWKSCacheForTest(): void {
  jwksCache.clear();
}

/**
 * Enforces security gates on requests arriving via *.workers.dev hostnames:
 * 1. Blocks Version URLs executing against production database bindings (synx-db).
 * 2. Requires and validates Cloudflare Access authentication on Worker Previews.
 *
 * Returns a Response (e.g. 403) to reject the request, or null to allow it to proceed.
 */
export async function verifyWorkersDevAccess(
  request: Request,
  env: Env,
  customJWKS?: JWTVerifyGetKey,
): Promise<Response | null> {
  if (!isWorkersDevRequest(request)) {
    return null;
  }

  // 1. Database isolation guard:
  // Version URLs run with the top-level production configuration (APP_ENV = "production").
  // Worker Previews run with the overrides in previews block (APP_ENV = "preview").
  // Reject any workers.dev request running with production bindings to ensure synx-db
  // is never accessed over workers.dev.
  const appEnv = env.APP_ENV || "production";
  if (appEnv !== "preview") {
    return new Response(
      "Forbidden: Version URLs with production database bindings are disabled. Access production via synx.christran.io.",
      {
        status: 403,
        headers: applySecurityHeaders(
          new Headers({ "Content-Type": "text/plain; charset=utf-8" }),
        ),
      },
    );
  }

  // 2. Cloudflare Access enforcement on Worker Previews:
  const token = extractAccessJwt(request);
  if (!token) {
    return new Response(
      "Forbidden: Cloudflare Access authentication required for preview URLs.",
      {
        status: 403,
        headers: applySecurityHeaders(
          new Headers({ "Content-Type": "text/plain; charset=utf-8" }),
        ),
      },
    );
  }

  // 3. Cryptographic JWT verification when Cloudflare Access team domain & AUD are configured:
  if (env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD) {
    const normalizedDomain =
      "https://" +
      env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const jwks = customJWKS || getAccessJWKS(env.CF_ACCESS_TEAM_DOMAIN);
    try {
      await jwtVerify(token, jwks, {
        issuer: normalizedDomain,
        audience: env.CF_ACCESS_AUD,
      });
    } catch {
      return new Response("Forbidden: Invalid Cloudflare Access token.", {
        status: 403,
        headers: applySecurityHeaders(
          new Headers({ "Content-Type": "text/plain; charset=utf-8" }),
        ),
      });
    }
  }

  return null;
}
