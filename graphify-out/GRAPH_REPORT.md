# Graph Report - to-do-list  (2026-06-26)

## Corpus Check
- 20 files · ~14,187 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 160 nodes · 184 edges · 17 communities (14 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32d8df8e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Todo View and Components|Todo View and Components]]
- [[_COMMUNITY_User Authentication|User Authentication]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Project Settings and Metadata|Project Settings and Metadata]]
- [[_COMMUNITY_Development Dependencies|Development Dependencies]]
- [[_COMMUNITY_Remix and Vite Server Setup|Remix and Vite Server Setup]]
- [[_COMMUNITY_TodoManager Core Logic|TodoManager Core Logic]]
- [[_COMMUNITY_Package Scripts|Package Scripts]]
- [[_COMMUNITY_Production Dependencies|Production Dependencies]]
- [[_COMMUNITY_Documentation Concepts|Documentation Concepts]]
- [[_COMMUNITY_Worker Configuration Types|Worker Configuration Types]]
- [[_COMMUNITY_GitHub Dependabot Config|GitHub Dependabot Config]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `TodoManager` - 13 edges
3. `scripts` - 11 edges
4. `getAuthClient()` - 8 edges
5. `getCookieAttributes()` - 8 edges
6. `cloudflare` - 8 edges
7. `getOptionalUser()` - 7 edges
8. `sYnX To-Do List App` - 7 edges
9. `getAuthSettings()` - 5 edges
10. `getLoadContext()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `fetch()` --calls--> `getLoadContext()`  [EXTRACTED]
  server.ts → load-context.ts
- `loader()` --calls--> `getAuthClient()`  [EXTRACTED]
  app/routes/login.tsx → app/auth.server.ts
- `loader()` --calls--> `getCookieAttributes()`  [EXTRACTED]
  app/routes/logout.tsx → app/auth.server.ts
- `action()` --calls--> `getOptionalUser()`  [EXTRACTED]
  app/routes/$id.tsx → app/auth.server.ts
- `loader()` --calls--> `getOptionalUser()`  [EXTRACTED]
  app/routes/$id.tsx → app/auth.server.ts

## Import Cycles
- None detected.

## Communities (17 total, 3 thin omitted)

### Community 0 - "Todo View and Components"
Cohesion: 0.11
Nodes (11): getOptionalUser(), PendingReminder, Todo, UserSettings, action(), Filter, formatReminder(), loader() (+3 more)

### Community 1 - "User Authentication"
Cohesion: 0.20
Nodes (12): clients, getAuthClient(), getAuthSettings(), getClientID(), getCookieAttributes(), getCookieDomain(), requireUser(), subjects (+4 more)

### Community 2 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 3 - "Project Settings and Metadata"
Cohesion: 0.11
Nodes (17): cloudflare, categories, dash, docs_url, icon_urls, label, preview_image_url, products (+9 more)

### Community 4 - "Development Dependencies"
Cohesion: 0.12
Nodes (17): devDependencies, autoprefixer, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, eslint, postcss, @remix-run/dev, tailwindcss (+9 more)

### Community 5 - "Remix and Vite Server Setup"
Cohesion: 0.24
Nodes (7): AppLoadContext, getLoadContext(), GetLoadContextArgs, fetch(), handleRemixRequest, scheduled(), Future

### Community 7 - "Package Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, cf-typegen, check, deploy, dev, lint, preview (+3 more)

### Community 8 - "Production Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, isbot, nanoid, @openauthjs/openauth, react, react-dom, @remix-run/cloudflare, @remix-run/react (+2 more)

### Community 9 - "Documentation Concepts"
Cohesion: 0.25
Nodes (8): Apply Locally, Cloudflare D1 Database, Cloudflare Workers Assets, Database Migration Setup, Getting Started, Key Features, Remix Framework, sYnX To-Do List App

## Knowledge Gaps
- **79 isolated node(s):** `subjects`, `clients`, `Filter`, `priorityConfig`, `GetLoadContextArgs` (+74 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Development Dependencies` to `Project Settings and Metadata`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `TodoManager` connect `TodoManager Core Logic` to `Todo View and Components`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `scripts` connect `Package Scripts` to `Project Settings and Metadata`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `subjects`, `clients`, `Filter` to the rest of the system?**
  _79 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Todo View and Components` be split into smaller, more focused modules?**
  _Cohesion score 0.11462450592885376 - nodes in this community are weakly interconnected._
- **Should `TypeScript Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `Project Settings and Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._