## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Always commit graphify updates in a separate chore commit (e.g. `chore: update graphify graph`). Never bundle `graphify-out/` changes into feature, fix, or refactor commits, as graph changes clutter the commit diff and make PR reviews difficult.

## Checks (CI runs these)

GitHub Actions (`.github/workflows/ci.yml`) runs these on every pull request and push to main, so run them before finishing a change:

- `npm run lint`
- `npm test -- --run --maxWorkers=2`
- `npm run typecheck` (web, must report 0 errors) and `npm run typecheck:mobile-tests` (root tests that import mobile code, checked with the mobile types)
- `cd mobile && npm run typecheck`
- `cd mobile && npm run doctor` when `mobile/` or `shared/` changes (see below)

Tests that import mobile code (and so React Native) go in `test/tsconfig.mobile.json` and the root `tsconfig.json` exclude list, not the web typecheck.

## Mobile dependency check (expo-doctor)

- After any change to mobile dependencies (`mobile/package.json` or `mobile/package-lock.json`), and before any mobile build or release, run `cd mobile && npm run doctor`. It runs `expo-doctor`, the same check the EAS build runs. Use Node 22.13 or newer.
- If a check fails because package versions don't match the Expo SDK, fix it with `cd mobile && npx expo install --fix` (updates `package.json` and the lockfile together), then run the doctor again until all checks pass. Don't hand-edit versions or silence checks; report anything it can't fix.

## Versioning Rules (SemVer)

Follow **`.claude/rules/versioning.md`** (canonical). Summary:

- SemVer `MAJOR.MINOR.PATCH`: feature batch → minor; fixes → patch; breaking changes → major.
- Same calendar day as the last release for that surface: append changelog bullets; do not bump again. A PR merging on a different day gets a new version + dated What's New entry.
- **Mobile** single source of truth: `shared/mobile-version.ts`. After editing, run `cd mobile && npm run sync-version` so `mobile/package.json` and `mobile/app.json` match. `app.config.js` sets Expo `version` (Android `versionName` / iOS short version). Do not hand-edit EAS-managed `versionCode` / `buildNumber`.
- **Web** (`WEB_VERSION` in `app/constants/changelog.ts`) is separate; bump only for user-facing web changes.
- Changelog items within each version go NEW → IMPR → FIX (defined in `shared/changelog.ts`, enforced by `test/changelog-order.test.ts`).
- Before finish: version file → sync → changelog → tests. Full checklist in the canonical doc.
