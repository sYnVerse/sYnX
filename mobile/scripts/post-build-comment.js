/**
 * EAS Workflow step: after an Android preview workflow run on main, comment on
 * the pull request that produced the commit (or the commit itself on direct push)
 * with details on whether an Over-The-Air (OTA) update was published or a fresh
 * Android preview APK was compiled.
 *
 * Authentication (in priority order):
 * 1. GitHub App (.pem private key + App ID) — mints an RS256 JWT via Node's
 *    built-in `crypto` and exchanges it for a short-lived installation token so
 *    comments are posted as `sYnVerse-Gemini[bot]` without an expiring PAT:
 *      - `SYNX_GITHUB_APP_ID` (or `GITHUB_APP_ID`)
 *      - `SYNX_GITHUB_APP_PRIVATE_KEY` (or `GITHUB_APP_PRIVATE_KEY`, PEM format)
 *      - `SYNX_GITHUB_APP_INSTALLATION_ID` (optional; resolved dynamically via
 *        `/repos/{owner}/{repo}/installation` when omitted)
 * 2. `SYNX_GITHUB_COMMENT_TOKEN` — fallback fine-grained PAT for local runs or
 *    environments without GitHub App keys.
 *
 * Skips (without failing the workflow) when no credentials are configured.
 */
const crypto = require("node:crypto");

const DEFAULT_REPO = "sYnVerse/sYnX";
const EXPO_BUILDS = "https://expo.dev/accounts/chris-tran/projects/synx/builds";
const GITHUB_API_BASE = "https://api.github.com";

function githubHeaders(token, extra = {}) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

/** Normalizes a PEM private key from env vars (expanding escaped `\n` newlines). */
function normalizePrivateKey(rawKey) {
  return String(rawKey || "").replace(/\\n/g, "\n").trim();
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

/** Creates an RS256 GitHub App JWT valid for 9 minutes (with -60s clock skew). */
function createAppJwt(appId, privateKeyPem, nowSec = Math.floor(Date.now() / 1000)) {
  const normalizedId = String(appId || "").trim();
  const normalizedKey = normalizePrivateKey(privateKeyPem);
  if (!normalizedId) throw new Error("GitHub App ID is required to create JWT");
  if (!normalizedKey) throw new Error("GitHub App private key is required to create JWT");

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: nowSec - 60,
      exp: nowSec + 9 * 60,
      iss: normalizedId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(normalizedKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function resolveInstallationId(jwt, repo, env = process.env, fetchImpl = globalThis.fetch) {
  const configured = (
    env.SYNX_GITHUB_APP_INSTALLATION_ID ||
    env.GITHUB_APP_INSTALLATION_ID ||
    ""
  ).trim();
  if (configured) return configured;

  const path = `/repos/${repo}/installation`;
  const res = await fetchImpl(`${GITHUB_API_BASE}${path}`, {
    method: "GET",
    headers: githubHeaders(jwt),
  });
  if (!res.ok) {
    throw new Error(`GitHub GET ${path}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data || data.id == null) {
    throw new Error(`GitHub GET ${path}: missing installation id in response`);
  }
  return String(data.id);
}

/**
 * Resolves a GitHub token from App credentials (preferred) or PAT fallback.
 * Returns `{ token, source }` or `null` when neither credential set is present.
 */
async function getInstallationToken(env = process.env, fetchImpl = globalThis.fetch) {
  const appId = (env.SYNX_GITHUB_APP_ID || env.GITHUB_APP_ID || "").trim();
  const privateKey = (env.SYNX_GITHUB_APP_PRIVATE_KEY || env.GITHUB_APP_PRIVATE_KEY || "").trim();

  if (appId && privateKey) {
    const repo = env.GITHUB_REPOSITORY || DEFAULT_REPO;
    const jwt = createAppJwt(appId, privateKey);
    const installationId = await resolveInstallationId(jwt, repo, env, fetchImpl);
    const path = `/app/installations/${installationId}/access_tokens`;
    const res = await fetchImpl(`${GITHUB_API_BASE}${path}`, {
      method: "POST",
      headers: githubHeaders(jwt),
    });
    if (!res.ok) {
      throw new Error(`GitHub POST ${path}: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (!data || !data.token) {
      throw new Error(`GitHub POST ${path}: missing installation token in response`);
    }
    return { token: data.token, source: "github-app" };
  }

  const pat = (env.SYNX_GITHUB_COMMENT_TOKEN || "").trim();
  if (pat) {
    return { token: pat, source: "pat" };
  }

  return null;
}

function hasAuthCredentials(env = process.env) {
  const appId = (env.SYNX_GITHUB_APP_ID || env.GITHUB_APP_ID || "").trim();
  const privateKey = (env.SYNX_GITHUB_APP_PRIVATE_KEY || env.GITHUB_APP_PRIVATE_KEY || "").trim();
  const pat = (env.SYNX_GITHUB_COMMENT_TOKEN || "").trim();
  return Boolean((appId && privateKey) || pat);
}

async function gh(path, init = {}, env = process.env, tokenOverride = null) {
  const repo = env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const token = tokenOverride || env.SYNX_GITHUB_COMMENT_TOKEN;
  const res = await fetch(`${GITHUB_API_BASE}/repos/${repo}${path}`, {
    ...init,
    headers: {
      ...githubHeaders(token, { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method || "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function parseUpdateRuntimeVersion(updatesJson) {
  if (!updatesJson) return null;
  try {
    const parsed = typeof updatesJson === "string" ? JSON.parse(updatesJson) : updatesJson;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0].runtimeVersion || null;
    }
    if (parsed && typeof parsed === "object" && parsed.runtimeVersion) {
      return parsed.runtimeVersion;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function body(env = process.env) {
  const expoBuilds = EXPO_BUILDS;
  const {
    BUILD_ID,
    BUILD_STATUS,
    APP_VERSION,
    APP_BUILD_VERSION,
    COMMIT_SHA,
    WORKFLOW_URL,
    UPDATE_ID,
    UPDATES_JSON,
    UPDATE_STATUS,
    UPDATE_CHANNEL,
    RUNTIME_VERSION,
    FINGERPRINT_HASH,
    MATCHED_RUNTIME_VERSION,
    MATCHED_BUILD_ID,
  } = env;

  const publishedRuntime = parseUpdateRuntimeVersion(UPDATES_JSON);
  const expectedRuntime = MATCHED_RUNTIME_VERSION || FINGERPRINT_HASH || RUNTIME_VERSION;
  const runtimeVersion = publishedRuntime || expectedRuntime;
  const commitShort = (COMMIT_SHA || "").slice(0, 7);

  // 1. Successful OTA update published
  if (UPDATE_ID) {
    const isMismatch = Boolean(publishedRuntime && expectedRuntime && publishedRuntime !== expectedRuntime);
    if (isMismatch) {
      const lines = [
        `### ⚠️ Over-The-Air (OTA) runtime version mismatch`,
        "",
        `- **Channel**: \`${UPDATE_CHANNEL || "preview"}\``,
        `- **Published Runtime**: \`${publishedRuntime}\``,
        `- **Expected Runtime (Preview APK)**: \`${expectedRuntime}\``,
        `- **Update Group ID**: \`${UPDATE_ID}\``,
        MATCHED_BUILD_ID ? `- **Base Preview Build**: [${MATCHED_BUILD_ID.slice(0, 8)}](${expoBuilds}/${MATCHED_BUILD_ID})` : null,
        "",
        "⚠️ **Warning**: The published update targets a runtime version that does not match the native preview APK. Installed preview devices will not download this update.",
      ];
      if (commitShort) {
        lines.push("", `Commit \`${commitShort}\``);
      }
      return lines.filter((l) => l !== null).join("\n");
    }

    const lines = [
      `### 🚀 Over-The-Air (OTA) preview update published`,
      "",
      `- **Channel**: \`${UPDATE_CHANNEL || "preview"}\``,
      runtimeVersion ? `- **Runtime Version**: \`${runtimeVersion}\`` : null,
      `- **Update Group ID**: \`${UPDATE_ID}\``,
      MATCHED_BUILD_ID ? `- **Base Preview Build**: [${MATCHED_BUILD_ID.slice(0, 8)}](${expoBuilds}/${MATCHED_BUILD_ID})` : null,
      "",
      "Devices running the preview build will automatically receive this update on next app launch, or you can check immediately via **Settings > About & Release Notes > Check for updates**.",
    ];
    if (commitShort) {
      lines.push("", `Commit \`${commitShort}\``);
    }
    return lines.filter((l) => l !== null).join("\n");
  }

  // 2. Failed OTA update
  if (UPDATE_STATUS === "failure") {
    const lines = [
      `### ❌ Over-The-Air (OTA) preview update failed`,
      "",
      WORKFLOW_URL ? `[Workflow run](${WORKFLOW_URL})` : null,
      runtimeVersion ? `- **Runtime Version**: \`${runtimeVersion}\`` : null,
    ];
    if (commitShort) {
      lines.push("", `Commit \`${commitShort}\``);
    }
    return lines.filter((l) => l !== null).join("\n");
  }

  // 3. Android APK build succeeded or failed
  const ok = BUILD_STATUS === "success" && BUILD_ID;
  const buildUrl = BUILD_ID ? `${expoBuilds}/${BUILD_ID}` : null;
  const qrUrl = buildUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(buildUrl)}`
    : null;
  const version = APP_VERSION ? `v${APP_VERSION}${APP_BUILD_VERSION ? ` (${APP_BUILD_VERSION})` : ""}` : "";

  const lines = ok
    ? [
        `### 📱 Android preview build ready ${version}`.trim(),
        "",
        `**[Open build page to install or download the APK](${buildUrl})**`,
        "",
        `![Scan to install APK](${qrUrl})`,
        "",
        "Scan the QR code above or open the link on your Android device to install the APK.",
      ]
    : [
        `### ❌ Android preview build ${BUILD_STATUS || "failed"}`,
        "",
        buildUrl ? `[Build logs](${buildUrl})` : null,
        WORKFLOW_URL ? `[Workflow run](${WORKFLOW_URL})` : null,
      ];

  if (runtimeVersion) {
    lines.push("", `- Native Runtime Fingerprint: \`${runtimeVersion}\``);
  }
  if (commitShort) {
    lines.push("", `Commit \`${commitShort}\``);
  }
  return lines.filter((l) => l !== null).join("\n");
}

async function main(env = process.env) {
  if (!hasAuthCredentials(env)) {
    console.warn(
      "Neither GitHub App credentials (SYNX_GITHUB_APP_ID / SYNX_GITHUB_APP_PRIVATE_KEY) nor SYNX_GITHUB_COMMENT_TOKEN not set; skipping GitHub comment."
    );
    return;
  }
  const commitSha = env.COMMIT_SHA;
  if (!commitSha) {
    console.warn("No commit SHA (manual run?); skipping GitHub comment.");
    return;
  }
  const auth = await getInstallationToken(env);
  if (!auth) {
    console.warn("GitHub credentials unavailable; skipping GitHub comment.");
    return;
  }
  const token = auth.token;
  const pulls = await gh(`/commits/${commitSha}/pulls`, {}, env, token);
  const pr = pulls.find((p) => p.merged_at) || pulls[0];
  const commentBody = body(env);
  if (pr) {
    const c = await gh(
      `/issues/${pr.number}/comments`,
      { method: "POST", body: JSON.stringify({ body: commentBody }) },
      env,
      token
    );
    console.log(`Commented on pull request (${auth.source}): ${c.html_url}`);
  } else {
    const c = await gh(
      `/commits/${commitSha}/comments`,
      { method: "POST", body: JSON.stringify({ body: commentBody }) },
      env,
      token
    );
    console.log(`Commented on commit (${auth.source}): ${c.html_url}`);
  }

  const publishedRuntime = parseUpdateRuntimeVersion(env.UPDATES_JSON);
  const expectedRuntime = env.MATCHED_RUNTIME_VERSION || env.FINGERPRINT_HASH || env.RUNTIME_VERSION;
  if (env.UPDATE_ID && publishedRuntime && expectedRuntime && publishedRuntime !== expectedRuntime) {
    throw new Error(
      `OTA update runtime mismatch: published=${publishedRuntime}, expected=${expectedRuntime}`
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  body,
  main,
  gh,
  parseUpdateRuntimeVersion,
  normalizePrivateKey,
  createAppJwt,
  resolveInstallationId,
  getInstallationToken,
};
