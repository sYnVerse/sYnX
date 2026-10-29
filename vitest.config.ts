import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Tests build their D1 schema from the same migrations/ folder that
      // production uses, so the test schema can't drift from the real one.
      const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
      return {
        main: "./test/dummy-worker.ts",
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Test-only binding, read by test/apply-migrations.ts.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
