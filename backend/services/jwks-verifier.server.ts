import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";

export const ALLOWED_JWT_ALGORITHMS = ["ES256"] as const;
export const DEFAULT_JWKS_REFETCH_COOLDOWN_MS = 60_000;

interface IssuerJwksEntry {
  jwksUri: string;
  kids: Set<string>;
  jwks: JWTVerifyGetKey;
  lastRefetchAt: number;
  inflightFetch: Promise<void> | null;
}

const issuerCache = new Map<string, IssuerJwksEntry>();

export function resetJwksCacheForTests(): void {
  issuerCache.clear();
}

function extractKids(keyset: unknown): Set<string> {
  const kids = new Set<string>();
  const keys = (keyset as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) return kids;
  for (const key of keys) {
    if (key && typeof key === "object" && "kid" in key) {
      const kid = (key as { kid?: unknown }).kid;
      if (typeof kid === "string" && kid.length > 0) {
        kids.add(kid);
      }
    }
  }
  return kids;
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function loadInitialIssuerEntry(
  issuer: string,
  fetchImpl: typeof fetch,
): Promise<IssuerJwksEntry> {
  const wellKnown = (await fetchJson(
    fetchImpl,
    `${issuer}/.well-known/oauth-authorization-server`,
  )) as { jwks_uri?: unknown };
  if (typeof wellKnown?.jwks_uri !== "string" || !wellKnown.jwks_uri) {
    throw new Error("Missing jwks_uri in issuer metadata");
  }
  const keyset = (await fetchJson(fetchImpl, wellKnown.jwks_uri)) as JSONWebKeySet;
  return {
    jwksUri: wellKnown.jwks_uri,
    kids: extractKids(keyset),
    jwks: createLocalJWKSet(keyset),
    lastRefetchAt: -Infinity,
    inflightFetch: null,
  };
}

async function maybeRefetchForUnknownKid(
  entry: IssuerJwksEntry,
  kid: string,
  fetchImpl: typeof fetch,
  now: () => number,
  cooldownMs: number,
): Promise<void> {
  if (entry.kids.has(kid)) return;
  if (entry.inflightFetch) {
    await entry.inflightFetch;
    return;
  }
  const currentTime = now();
  if (currentTime - entry.lastRefetchAt < cooldownMs) {
    return;
  }
  // Record the attempt timestamp immediately so concurrent bad-kid floods coalesce under cooldown.
  entry.lastRefetchAt = currentTime;
  entry.inflightFetch = (async () => {
    try {
      const keyset = (await fetchJson(fetchImpl, entry.jwksUri)) as JSONWebKeySet;
      entry.jwks = createLocalJWKSet(keyset);
      entry.kids = extractKids(keyset);
    } catch {
      // Retain existing keyset on transient JWKS endpoint errors
    } finally {
      entry.inflightFetch = null;
    }
  })();
  await entry.inflightFetch;
}

type SubjectMap = Record<
  string,
  {
    "~standard": {
      validate: (
        value: unknown,
      ) =>
        | Promise<{ issues?: unknown; value?: unknown }>
        | { issues?: unknown; value?: unknown };
    };
  }
>;

export interface VerifyAccessJwtOptions<TSubjects extends SubjectMap = SubjectMap> {
  issuer: string;
  subjects: TSubjects;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cooldownMs?: number;
}

export interface VerifiedJwtResult<TProperties = Record<string, string>> {
  aud: string | string[] | undefined;
  exp: number | undefined;
  subject: {
    type: string;
    properties: TProperties;
  };
}

/**
 * Verifies a sYnID access JWT with pinned ES256 signing and JWKS caching that
 * refetches only on an unknown `kid` (rate-limited by a short cooldown, never on a TTL).
 */
export async function verifyAccessJwtWithJwks<TSubjects extends SubjectMap>(
  token: string,
  options: VerifyAccessJwtOptions<TSubjects>,
): Promise<VerifiedJwtResult | null> {
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = decodeProtectedHeader(token);
  } catch {
    return null;
  }

  if (header.alg !== "ES256") {
    return null;
  }

  const kid =
    typeof header.kid === "string" && header.kid.length > 0 ? header.kid : null;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const cooldownMs = options.cooldownMs ?? DEFAULT_JWKS_REFETCH_COOLDOWN_MS;

  try {
    let entry = issuerCache.get(options.issuer);
    if (!entry) {
      entry = await loadInitialIssuerEntry(options.issuer, fetchImpl);
      issuerCache.set(options.issuer, entry);
    } else if (kid !== null && !entry.kids.has(kid)) {
      await maybeRefetchForUnknownKid(entry, kid, fetchImpl, now, cooldownMs);
    }
    if (kid !== null && !entry.kids.has(kid)) {
      return null;
    }

    const { payload } = await jwtVerify(token, entry.jwks, {
      issuer: options.issuer,
      algorithms: [...ALLOWED_JWT_ALGORITHMS],
    });

    if (payload.mode !== "access" || typeof payload.type !== "string") {
      return null;
    }

    const subjectSchema = options.subjects[payload.type];
    if (!subjectSchema) {
      return null;
    }

    const validated = await subjectSchema["~standard"].validate(payload.properties);
    if (validated.issues || !validated.value || typeof validated.value !== "object") {
      return null;
    }

    return {
      aud: payload.aud,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
      subject: {
        type: payload.type,
        properties: validated.value as Record<string, string>,
      },
    };
  } catch {
    return null;
  }
}
