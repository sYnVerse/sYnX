import { execSync } from "node:child_process";

export default function globalSetup() {
  execSync("npx wrangler d1 migrations apply synx-db --local", {
    stdio: "inherit",
  });
}
