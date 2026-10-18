/**
 * Minimal sYnID-like OAuth mock with REQUIRE_PKCE=true behavior.
 * - GET /authorize requires code_challenge + code_challenge_method=S256
 * - POST /token requires matching code_verifier (S256)
 * - response_type=token is rejected
 */
import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";

const PORT = Number(process.env.MOCK_SYNID_PORT || 8787);
const codes = new Map(); // code -> { challenge, redirectUri, clientId }

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function s256(verifier) {
  return b64url(crypto.createHash("sha256").update(verifier).digest());
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        issuer: `http://127.0.0.1:${PORT}`,
        authorization_endpoint: `http://127.0.0.1:${PORT}/authorize`,
        token_endpoint: `http://127.0.0.1:${PORT}/token`,
        jwks_uri: `http://127.0.0.1:${PORT}/.well-known/jwks.json`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/authorize") {
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const responseType = url.searchParams.get("response_type");
    const state = url.searchParams.get("state") || "";
    const challenge = url.searchParams.get("code_challenge");
    const method = url.searchParams.get("code_challenge_method");

    if (responseType === "token") {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("response_type=token is disabled");
      return;
    }
    if (responseType !== "code") {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("unsupported response_type");
      return;
    }
    if (!challenge || method !== "S256") {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("PKCE required: provide code_challenge and code_challenge_method=S256");
      return;
    }
    if (!clientId || !redirectUri) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("missing client_id or redirect_uri");
      return;
    }

    const code = crypto.randomBytes(16).toString("hex");
    codes.set(code, { challenge, redirectUri, clientId });
    const dest = new URL(redirectUri);
    dest.searchParams.set("code", code);
    dest.searchParams.set("state", state);
    res.writeHead(302, { Location: dest.toString() });
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/token") {
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const grant = params.get("grant_type");
    const code = params.get("code");
    const redirectUri = params.get("redirect_uri");
    const verifier = params.get("code_verifier") || "";
    const clientId = params.get("client_id");

    if (grant !== "authorization_code" || !code) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    const entry = codes.get(code);
    if (!entry) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant" }));
      return;
    }
    if (entry.redirectUri !== redirectUri || entry.clientId !== clientId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant" }));
      return;
    }
    if (!verifier || s256(verifier) !== entry.challenge) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "pkce_failed" }));
      return;
    }
    codes.delete(code);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-synid] REQUIRE_PKCE=true listening on http://127.0.0.1:${PORT}`);
});
