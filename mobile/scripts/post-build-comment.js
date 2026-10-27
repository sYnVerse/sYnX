/**
 * EAS Workflow step: after a preview build on main, comment on the pull request
 * that produced the commit with a link to the build page, where the APK can be
 * installed or downloaded. Falls back to a commit comment when the commit has
 * no pull request (a direct push to main).
 *
 * Needs SYNX_GITHUB_COMMENT_TOKEN as a secret EAS environment variable: a
 * fine-grained GitHub token for this repo with Pull requests and Contents
 * read/write. Skips (without failing the workflow) when it isn't set.
 */
const REPO = process.env.GITHUB_REPOSITORY || "sYnVerse/sYnX";
const EXPO_BUILDS = "https://expo.dev/accounts/chris-tran/projects/synx/builds";

const token = process.env.SYNX_GITHUB_COMMENT_TOKEN;
const { BUILD_ID, BUILD_STATUS, APP_VERSION, APP_BUILD_VERSION, COMMIT_SHA, WORKFLOW_URL } =
  process.env;

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
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

function body() {
  const ok = BUILD_STATUS === "success" && BUILD_ID;
  const buildUrl = BUILD_ID ? `${EXPO_BUILDS}/${BUILD_ID}` : null;
  const version = APP_VERSION ? `v${APP_VERSION}${APP_BUILD_VERSION ? ` (${APP_BUILD_VERSION})` : ""}` : "";
  const lines = ok
    ? [
        `### 📱 Android preview build ready ${version}`.trim(),
        "",
        `**[Open the build to install or download the APK](${buildUrl})**`,
        "",
        "Open the link on your phone and tap Install, or scan the QR code on that page.",
      ]
    : [
        `### ❌ Android preview build ${BUILD_STATUS || "failed"}`,
        "",
        buildUrl ? `[Build logs](${buildUrl})` : null,
        WORKFLOW_URL ? `[Workflow run](${WORKFLOW_URL})` : null,
      ];
  lines.push("", `Commit \`${(COMMIT_SHA || "").slice(0, 7)}\``);
  return lines.filter((l) => l !== null).join("\n");
}

async function main() {
  if (!token) {
    console.warn("SYNX_GITHUB_COMMENT_TOKEN not set; skipping GitHub comment.");
    return;
  }
  if (!COMMIT_SHA) {
    console.warn("No commit SHA (manual run?); skipping GitHub comment.");
    return;
  }
  const pulls = await gh(`/commits/${COMMIT_SHA}/pulls`);
  const pr = pulls.find((p) => p.merged_at) || pulls[0];
  if (pr) {
    const c = await gh(`/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body: body() }) });
    console.log(`Commented on pull request: ${c.html_url}`);
  } else {
    const c = await gh(`/commits/${COMMIT_SHA}/comments`, { method: "POST", body: JSON.stringify({ body: body() }) });
    console.log(`Commented on commit: ${c.html_url}`);
  }
}

main().catch((err) => {
  // A failed comment shouldn't mark the build workflow as failed.
  console.error(err);
});
