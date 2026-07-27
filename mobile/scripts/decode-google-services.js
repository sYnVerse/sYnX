/**
 * EAS Build pre-install hook: decode GOOGLE_SERVICES_JSON_BASE64 into google-services.json.
 * Skips gracefully when the secret is not present (local/dev builds).
 */
const fs = require("fs");
const path = require("path");

const b64 = process.env.GOOGLE_SERVICES_JSON_BASE64;
const outPath = path.join(__dirname, "..", "google-services.json");

if (!b64) {
  console.warn(
    "[eas-build-pre-install] GOOGLE_SERVICES_JSON_BASE64 not set; skipping google-services.json decode."
  );
  process.exit(0);
}

try {
  fs.writeFileSync(outPath, Buffer.from(b64, "base64").toString("utf8"));
  console.log("[eas-build-pre-install] Wrote google-services.json");
} catch (err) {
  console.error("[eas-build-pre-install] Failed to decode google-services.json:", err);
  process.exit(1);
}
