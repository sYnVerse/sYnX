/**
 * Keep package.json + app.json version aligned with shared/mobile-version.ts (SSOT).
 * Prefers mobile/src/shared copy (after sync-shared) then repo-root shared/.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const repoShared = path.resolve(root, "../shared/mobile-version.ts");
const mobileShared = path.join(root, "src/shared/mobile-version.ts");
const pkgPath = path.join(root, "package.json");
const appJsonPath = path.join(root, "app.json");

function readVersion() {
  for (const versionPath of [mobileShared, repoShared]) {
    if (!fs.existsSync(versionPath)) continue;
    const src = fs.readFileSync(versionPath, "utf8");
    const match = src.match(/MOBILE_APP_VERSION\s*=\s*"([^"]+)"/);
    if (match) return { version: match[1], from: versionPath };
  }
  console.error("[sync-version] MOBILE_APP_VERSION not found");
  process.exit(1);
}

const { version, from } = readVersion();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[sync-version] Invalid SemVer: ${version}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`[sync-version] package.json → ${version} (from ${from})`);
} else {
  console.log(`[sync-version] package.json already ${version}`);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
if (appJson.expo?.version !== version) {
  appJson.expo.version = version;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");
  console.log(`[sync-version] app.json expo.version → ${version}`);
} else {
  console.log(`[sync-version] app.json already ${version}`);
}
