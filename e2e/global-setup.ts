import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default function globalSetup() {
  execSync(
    "npx wrangler d1 migrations apply synx-db --local --config backend/wrangler.jsonc --persist-to backend/.wrangler/state",
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  );
}
