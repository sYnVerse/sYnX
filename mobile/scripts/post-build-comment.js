/**
 * EAS Workflow step: after an Android preview workflow run on main, comment on
 * the pull request that produced the commit (or the commit itself on direct push)
 * with details on whether an Over-The-Air (OTA) update was published or a fresh
 * Android preview APK was compiled.
 *
 * Needs SYNX_GITHUB_COMMENT_TOKEN as a secret EAS environment variable: a
 * fine-grained GitHub token for this repo with Pull requests and Contents
 * read/write. Skips (without failing the workflow) when it isn't set.
 */
const DEFAULT_REPO = "sYnVerse/sYnX";
const EXPO_BUILDS = "https://expo.dev/accounts/chris-tran/projects/synx/builds";

async function gh(path, init = {}, env = process.env) {
  const repo = env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const token = env.SYNX_GITHUB_COMMENT_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
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
  const token = env.SYNX_GITHUB_COMMENT_TOKEN;
  const commitSha = env.COMMIT_SHA;
  if (!token) {
    console.warn("SYNX_GITHUB_COMMENT_TOKEN not set; skipping GitHub comment.");
    return;
  }
  if (!commitSha) {
    console.warn("No commit SHA (manual run?); skipping GitHub comment.");
    return;
  }
  const pulls = await gh(`/commits/${commitSha}/pulls`, {}, env);
  const pr = pulls.find((p) => p.merged_at) || pulls[0];
  const commentBody = body(env);
  if (pr) {
    const c = await gh(`/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body: commentBody }) }, env);
    console.log(`Commented on pull request: ${c.html_url}`);
  } else {
    const c = await gh(`/commits/${commitSha}/comments`, { method: "POST", body: JSON.stringify({ body: commentBody }) }, env);
    console.log(`Commented on commit: ${c.html_url}`);
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
    if (err.message && err.message.includes("OTA update runtime mismatch")) {
      process.exit(1);
    }
  });
}

module.exports = { body, main, gh, parseUpdateRuntimeVersion };
