## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Always commit graphify updates in a separate chore commit (e.g. `chore: update graphify graph`). Never bundle `graphify-out/` changes into feature, fix, or refactor commits, as graph changes clutter the commit diff and make PR reviews difficult.

## Checks (CI runs these)

GitHub Actions (`.github/workflows/ci.yml`) runs these on every pull request, so run them before finishing a change:

- `npm run lint`
- `npm test -- --run --maxWorkers=2`
- `npm run test:e2e` (Playwright E2E UI suite: guest, signed-in auth/profile, lists/tasks, and shared lists, run against local wrangler dev)
- `npm run typecheck` (web, must report 0 errors) and `npm run typecheck:mobile-tests` (root tests that import mobile code, checked with the mobile types)
- `cd mobile && npm run typecheck`
- `cd mobile && npm run doctor` when `mobile/` or `shared/` changes (see below)
- `cd mobile && npm run lint` when `mobile/` or `shared/` changes (Expo's ESLint setup in `mobile/eslint.config.js`; `--max-warnings 0`, so warnings fail CI too)

Tests that import mobile code (and so React Native) go in `test/tsconfig.mobile.json` and the root `tsconfig.json` exclude list, not the web typecheck.

## End-to-End Testing (Playwright)

The web end-to-end suite lives in `e2e/` and runs with `npm run test:e2e` against local `wrangler dev` (which serves the built Remix server bundle on loopback with local D1 migrations applied).

- **CI Enforcement**:
  - The `e2e` job in `.github/workflows/ci.yml` runs on every pull request that touches web or test code.
  - It executes `npm run test:e2e` (all guest and signed-in suites). Any test failure fails the job and blocks merging.

- **Suites**:
  - `e2e/guest-list-check.spec.ts`: Core guest smoke tests (kept intact from baseline).
  - `e2e/guest-broader-coverage.spec.ts`: Empty states, filtering, searching, header/sidebar renaming, statistics modal, theme toggle, and sign-in CTA.
  - `e2e/signed-in-auth-and-profile.spec.ts`: Loopback sign-in, session persistence on reload, sign-out (including verification that users remain signed out after reload and cannot open protected settings), guest data migration to signed-in account, profile display name / time zone / notification preferences, and unsaved changes prompt.
  - `e2e/signed-in-lists-and-tasks.spec.ts`: Multi-list CRUD, category tags (preset & custom), task & subtask lifecycle, inline edit, priority/duration/recurrence/reminder persistence across reloads, toolbar sort & filter persistence, and calendar view scheduling.
  - `e2e/shared-lists.spec.ts`: Private list access control (unauthorized collaborator redirect), view-only (`public_read`) list restrictions & "Shared with me" sidebar, collaborative (`public_edit`) workflow with delete requests/approval and leaving/unlinking ("Remove from Shared with me"), and permission revocation (owner locking list back to private).

- **Contributor Setup & Test Auth Commands**:
  - **Running all tests**: `npm run test:e2e` (rebuilds the server bundle and executes the full Playwright suite).
  - **Running individual suites**: `npx playwright test e2e/<file>.spec.ts` (Playwright automatically starts `wrangler dev` with test auth enabled if not already running).
  - **Local Test Auth Architecture**:
    - Gated strictly by `ALLOW_DEV_TEST_AUTH="true"` AND a loopback request host (`127.0.0.1` or `localhost`). (`ALLOW_DEV_REDIRECTS` is reserved for OAuth dev redirect allowance and does NOT enable test auth bypass).
    - Requires an explicit test login query parameter (`test_login=true`, `test_user_id`, or `userId`) so visiting plain `/login` starts real OAuth.
    - Gating is verified by unit tests in `test/e2e-test-auth.test.ts` to ensure production safety (`wrangler.jsonc` does not set this flag, and public domains reject test auth).
    - In tests, create and sign in a test user with helpers from `e2e/helpers.ts`:
      ```typescript
      import { createTestUser, signInAs } from "./helpers";
      const user = createTestUser("my_feature");
      await signInAs(page, user);
      ```
    - `signInAs` navigates to `/login?test_login=true&test_user_id=...&test_email=...&test_display_name=...`, minting a local session cookie instantly without hitting `auth.christran.io`.

## Mobile dependency check (expo-doctor)

- After any change to mobile dependencies (`mobile/package.json` or `mobile/package-lock.json`), and before any mobile build or release, run `cd mobile && npm run doctor`. It runs `expo-doctor`, the same check the EAS build runs. Use Node 22.13 or newer.
- If a check fails because package versions don't match the Expo SDK, fix it with `cd mobile && npx expo install --fix` (updates `package.json` and the lockfile together), then run the doctor again until all checks pass. Don't hand-edit versions or silence checks; report anything it can't fix.

## Database schema (D1 migrations)

The D1 schema lives in `migrations/` (numbered SQL files applied by Wrangler and recorded in the `d1_migrations` table). `migrations/0000_baseline.sql` mirrors production as of Oct 27, 2026; later files build on it.

- Every schema change is a new numbered migration: `npx wrangler d1 migrations create synx-db <name>`, then `npx wrangler d1 migrations apply synx-db --local`. Tests build their database from `migrations/` (see `test/apply-migrations.ts`), so don't hand-write `CREATE TABLE` in tests.
- Never edit a migration that has already been applied (anything merged to main). Fix it with a new migration.
- Keep schema changes additive within a release (expand, then contract): add the new column or table, ship code that uses it, and only drop or rename the old one in a later release, once no deployed code (web or mobile) relies on it.
- No DDL (`CREATE`/`ALTER`/`DROP`) or `PRAGMA` schema checks in app code. The app assumes the schema from `migrations/` is in place; don't add "create if missing" or "add column if missing" code, and don't wrap queries in `try/catch` just to ignore schema errors.
- Never run `wrangler d1 migrations apply` or `wrangler d1 execute` with `--remote` by hand. Production migrations run only in the deploy pipeline (`npm run deploy`, which Workers Builds runs on pushes to main). Don't run `npm run deploy` from your own machine either, since it applies migrations to production. `wrangler d1 migrations list synx-db --remote` is read-only and fine for checking.

## Worker Previews (pull request previews)

Every pull request gets a Preview URL from Workers Builds (`wrangler preview`), set up in the `previews` block of `wrangler.jsonc` and deployed via `npm run deploy:preview`.

- Previews use their own `synx-preview` D1 database, never `synx-db`. Before each Preview deploys, `npm run deploy:preview` applies `migrations/` to it through `wrangler.preview-migrations.jsonc` and deploys via `wrangler preview`. If you change the preview database, change it in both files.
- Previews don't inherit production settings. Any new binding the app needs must be added to `previews` too, pointed at a preview-safe resource. Never point a preview binding at a production resource.
- Previews have no notification secrets (Resend, Twilio, Firebase), and cron triggers don't run on them. Don't add any of these.
- Sign-in doesn't work on previews yet, so check changes there in guest mode.
- Previews are served on `workers.dev`, behind Cloudflare Access. Don't move them to a `christran.io` hostname: production sign-in cookies are set on `.christran.io` and would reach preview code. `preview_urls: true` also turns on Version URLs, which run with production bindings, so Access must stay on for this Worker's `workers.dev` URLs.

## Versioning Rules (SemVer)

Follow **`.claude/rules/versioning.md`** (canonical). Summary:

- SemVer `MAJOR.MINOR.PATCH`: feature batch → minor; fixes → patch; breaking changes → major.
- Same calendar day as the last release for that surface: append changelog bullets; do not bump again. A PR merging on a different day gets a new version + dated What's New entry.
- **Mobile** single source of truth: `shared/mobile-version.ts`. After editing, run `cd mobile && npm run sync-version` so `mobile/package.json` and `mobile/app.json` match. `app.config.js` sets Expo `version` (Android `versionName` / iOS short version). Do not hand-edit EAS-managed `versionCode` / `buildNumber`.
- **Web** (`WEB_VERSION` in `app/constants/changelog.ts`) is separate; bump only for user-facing web changes.
- Changelog items within each version go NEW → IMPR → FIX (defined in `shared/changelog.ts`, enforced by `test/changelog-order.test.ts`).
- Before finish: version file → sync → changelog → tests. Full checklist in the canonical doc.
