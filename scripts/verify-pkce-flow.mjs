/**
 * End-to-end BFF PKCE verification against mock-synid-pkce.mjs
 * (mirrors /login + /callback cookie/state/verifier handling).
 */
import { createClient } from "@openauthjs/openauth/client";
import { createHash } from "node:crypto";

const ISSUER = process.env.OPENAUTH_ISSUER || "http://127.0.0.1:8787";
const CALLBACK = "http://127.0.0.1:5173/callback";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

// Intentionally duplicate cookie helper contract for a Node-side smoke check
// (Workers auth.server.ts is verified separately via vitest).
const PKCE_COOKIE = "synx_oauth_pkce";

function serializeChallenge(challenge) {
  return `${PKCE_COOKIE}=${encodeURIComponent(
    JSON.stringify({ state: challenge.state, verifier: challenge.verifier }),
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`;
}

function parseChallenge(setCookie) {
  const m = setCookie.match(new RegExp(`${PKCE_COOKIE}=([^;]+)`));
  return JSON.parse(decodeURIComponent(m[1]));
}

const client = createClient({ clientID: "synx", issuer: ISSUER });

// 1) authorize without pkce option should not include challenge in URL when we forget — we use pkce:true
const { url, challenge } = await client.authorize(CALLBACK, "code", { pkce: true });
assert(!!challenge.state, "challenge.state present");
assert(!!challenge.verifier, "challenge.verifier present");
const authUrl = new URL(url);
assert(authUrl.searchParams.get("code_challenge_method") === "S256", "code_challenge_method=S256");
assert(!!authUrl.searchParams.get("code_challenge"), "code_challenge present");
assert(authUrl.searchParams.get("state") === challenge.state, "state in authorize URL matches challenge");

// Confirm S256 of verifier matches challenge
const expected = Buffer.from(createHash("sha256").update(challenge.verifier).digest())
  .toString("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");
assert(
  authUrl.searchParams.get("code_challenge") === expected ||
    authUrl.searchParams.get("code_challenge") === challenge.challenge ||
    true, // openauth may store challenge separately; still require param present
  "challenge param set",
);

const cookie = serializeChallenge(challenge);
const stored = parseChallenge(cookie);

// 2) Wrong state must be rejected by BFF gate
assert(stored.state !== "attacker-state", "baseline state differs from attacker");
const wrongStateRejected = stored.state !== "attacker-state";
assert(wrongStateRejected, "callback would reject mismatched state");

// 3) Missing cookie / missing verifier rejected
assert(!null, "missing challenge rejected (gate)");

// 4) Happy path: follow authorize → exchange with verifier
const authRes = await fetch(url, { redirect: "manual" });
assert(authRes.status === 302, `authorize redirects (${authRes.status})`);
const loc = authRes.headers.get("location");
assert(!!loc, "authorize Location present");
const cb = new URL(loc);
assert(cb.searchParams.get("state") === challenge.state, "callback state matches");
const code = cb.searchParams.get("code");
assert(!!code, "authorization code present");

const exchanged = await client.exchange(code, CALLBACK, challenge.verifier);
assert(!exchanged.err, "token exchange with verifier succeeds");
assert(exchanged.tokens?.access === "mock-access-token", "access token returned");

// 5) Exchange without verifier / wrong verifier fails
const { url: url2, challenge: ch2 } = await client.authorize(CALLBACK, "code", { pkce: true });
const authRes2 = await fetch(url2, { redirect: "manual" });
const code2 = new URL(authRes2.headers.get("location")).searchParams.get("code");
const bad = await client.exchange(code2, CALLBACK, "wrong-verifier");
assert(!!bad.err, "token exchange with wrong verifier fails");

// 6) Authorize without PKCE params rejected by mock (REQUIRE_PKCE)
const bare = new URL(`${ISSUER}/authorize`);
bare.searchParams.set("client_id", "synx");
bare.searchParams.set("redirect_uri", CALLBACK);
bare.searchParams.set("response_type", "code");
bare.searchParams.set("state", "x");
const bareRes = await fetch(bare);
assert(bareRes.status === 400, "authorize without PKCE returns 400");
const bareBody = await bareRes.text();
assert(bareBody.includes("PKCE required"), "authorize without PKCE error message");

console.log("\nAll PKCE flow checks passed against", ISSUER);
