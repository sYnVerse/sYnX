const fs = require("fs");
const path = require("path");

/**
 * Read user-facing SemVer from the shared SSOT (copied into mobile/src/shared
 * by sync-shared.js; also present at repo root shared/ for local evaluation).
 */
function readMobileAppVersion() {
  const candidates = [
    path.join(__dirname, "src/shared/mobile-version.ts"),
    path.join(__dirname, "../shared/mobile-version.ts"),
  ];
  for (const versionPath of candidates) {
    if (!fs.existsSync(versionPath)) continue;
    const src = fs.readFileSync(versionPath, "utf8");
    const match = src.match(/MOBILE_APP_VERSION\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  throw new Error(
    "[app.config] MOBILE_APP_VERSION not found — run sync-shared / check shared/mobile-version.ts"
  );
}

/**
 * @param {{ config: Record<string, unknown> }} param0
 */
module.exports = ({ config }) => {
  const version = readMobileAppVersion();
  return {
    ...config,
    // Forces Android versionName / iOS CFBundleShortVersionString
    version,
  };
};
