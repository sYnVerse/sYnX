## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Versioning Rules (SemVer)
- Web baseline version: `v5.1.0`, Mobile baseline version: `v3.1.0`.
- All code changes must strictly follow Semantic Versioning (SemVer: `MAJOR.MINOR.PATCH`).
- A `MAJOR` bump is required for any breaking change listed in `.claude/rules/versioning.md` (e.g. `schema.sql` mutations, endpoint signature changes, deleted public APIs).


