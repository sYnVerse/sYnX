## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Versioning Rules (SemVer)

Follow **`.claude/rules/versioning.md`** (canonical). Summary:

- SemVer `MAJOR.MINOR.PATCH`: feature batch → minor; fixes → patch; breaking changes → major.
- Same calendar day as the last release for that surface: append changelog bullets; do not bump again. A PR merging on a different day gets a new version + dated What's New entry.
- **Mobile** single source of truth: `shared/mobile-version.ts`. After editing, run `cd mobile && npm run sync-version` so `mobile/package.json` and `mobile/app.json` match. `app.config.js` sets Expo `version` (Android `versionName` / iOS short version). Do not hand-edit EAS-managed `versionCode` / `buildNumber`.
- **Web** (`WEB_VERSION` in `app/constants/changelog.ts`) is separate; bump only for user-facing web changes.
- Before finish: version file → sync → changelog → tests. Full checklist in the canonical doc.
