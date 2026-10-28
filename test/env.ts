declare module "cloudflare:test" {
  export const env: ProvidedEnv;
  interface ProvidedEnv extends Env {
    /** D1 migrations read from migrations/ by vitest.config.ts. */
    TEST_MIGRATIONS: D1Migration[];
  }

  // From @cloudflare/vitest-pool-workers/types (not in tsconfig "types",
  // which would retype `env`), declared here for test/apply-migrations.ts.
  export interface D1Migration {
    name: string;
    queries: string[];
  }
  export function applyD1Migrations(
    db: D1Database,
    migrations: D1Migration[],
    migrationsTableName?: string
  ): Promise<void>;
}
