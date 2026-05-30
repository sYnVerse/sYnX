/// <reference types="@cloudflare/vitest-pool-workers" />
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  poolOptions: {
    singleWorker: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
  } as any,
});
