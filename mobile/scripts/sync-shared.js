const fs = require("fs");
const path = require("path");

const rootSharedDir = path.resolve(__dirname, "../../shared");
const mobileSharedDir = path.resolve(__dirname, "../src/shared");

if (fs.existsSync(rootSharedDir)) {
  if (!fs.existsSync(mobileSharedDir)) {
    fs.mkdirSync(mobileSharedDir, { recursive: true });
  }
  const files = fs.readdirSync(rootSharedDir);
  for (const file of files) {
    const src = path.join(rootSharedDir, file);
    const dest = path.join(mobileSharedDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
  console.log("[sync-shared] Successfully synced shared directory to mobile/src/shared");
} else {
  console.warn("[sync-shared] Root shared directory not found, skipping sync.");
}
