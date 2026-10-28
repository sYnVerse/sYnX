import { beforeAll } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";

// Vitest setup file: runs before every test file. Storage is isolated per test
// file, so each file starts from a database built by migrations/, the same
// files production uses. Already-applied migrations are skipped.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
