# Graph Report - workspace  (2026-07-29)

## Corpus Check
- 58 files · ~169,913 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 437 nodes · 611 edges · 30 communities (24 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fb5e8c5a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- $id.tsx
- auth.server.ts
- compilerOptions
- scripts
- devDependencies
- server.ts
- verifyBearerToken
- dependencies
- dependencies
- Cloudflare D1 Database
- worker-configuration.d.ts
- Dependabot NPM Package Updates
- CLAUDE.md
- BottomTabNavigator.tsx
- expo
- index.ts
- mobile/package.json
- mobile/tsconfig.json
- metro.config.js
- decode-google-services.js
- Cloudflare Workers Assets
- Remix Framework

## God Nodes (most connected - your core abstractions)
1. `verifyBearerToken()` - 25 edges
2. `@remix-run/cloudflare` - 21 edges
3. `TodoManager` - 20 edges
4. `compilerOptions` - 16 edges
5. `expo` - 13 edges
6. `getListAccess()` - 12 edges
7. `action()` - 11 edges
8. `scripts` - 11 edges
9. `include` - 10 edges
10. `getAuthClient()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `action()` --calls--> `verifyBearerToken()`  [EXTRACTED]
  app/routes/api.v1.devices.ts → app/auth.server.ts
- `action()` --calls--> `verifyBearerToken()`  [EXTRACTED]
  app/routes/api.v1.lists.$id.share-mode.ts → app/auth.server.ts
- `scheduled()` --calls--> `sendFCMPushNotification()`  [EXTRACTED]
  server.ts → app/fcm.server.ts
- `fetch()` --calls--> `getLoadContext()`  [EXTRACTED]
  server.ts → load-context.ts
- `TaskModalProps` --references--> `PriorityLevel`  [EXTRACTED]
  mobile/src/components/TaskModal.tsx → shared/index.ts

## Import Cycles
- None detected.

## Communities (30 total, 6 thin omitted)

### Community 0 - "$id.tsx"
Cohesion: 0.10
Nodes (17): CalendarView(), CalendarViewProps, EditTaskModalProps, priorityConfig, QuickAddTaskModalProps, Filter, formatReminder(), GuestContext (+9 more)

### Community 1 - "auth.server.ts"
Cohesion: 0.15
Nodes (15): clients, getAuthClient(), getAuthSettings(), getClientID(), getCookieAttributes(), getCookieDomain(), getOptionalUser(), requireUser() (+7 more)

### Community 2 - "compilerOptions"
Cohesion: 0.06
Nodes (35): **/.client/**/*.ts, **/.client/**/*.tsx, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, DOM, DOM.Iterable, env.d.ts, ES2022 (+27 more)

### Community 3 - "scripts"
Cohesion: 0.06
Nodes (33): cloudflare, categories, dash, docs_url, icon_urls, label, preview_image_url, products (+25 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (33): autoprefixer, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, eslint, devDependencies, autoprefixer, @cloudflare/vitest-pool-workers, @cloudflare/workers-types (+25 more)

### Community 5 - "server.ts"
Cohesion: 0.14
Nodes (15): base64UrlEncode(), FCMMessagePayload, getGoogleOAuthToken(), sendFCMPushNotification(), signRS256(), PendingReminder, AppLoadContext, getLoadContext() (+7 more)

### Community 6 - "verifyBearerToken"
Cohesion: 0.12
Nodes (18): getListAccess(), verifyBearerToken(), action(), action(), RenameListSchema, loader(), action(), loader() (+10 more)

### Community 7 - "dependencies"
Cohesion: 0.04
Nodes (45): axios, expo, expo-auth-session, expo-constants, expo-linking, expo-notifications, expo-secure-store, expo-splash-screen (+37 more)

### Community 8 - "dependencies"
Cohesion: 0.13
Nodes (15): isbot, @openauthjs/openauth, dependencies, isbot, @openauthjs/openauth, react, react-dom, @remix-run/cloudflare (+7 more)

### Community 18 - "BottomTabNavigator.tsx"
Cohesion: 0.10
Nodes (27): plugins, apiClient, TaskModal(), AuthContext, AuthContextType, AuthProvider(), useAuth(), BottomTabNavigator() (+19 more)

### Community 19 - "expo"
Cohesion: 0.07
Nodes (26): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, intentFilters, package, permissions, projectId (+18 more)

### Community 20 - "index.ts"
Cohesion: 0.11
Nodes (20): action(), action(), styles, TaskModalProps, CreateListInput, CreateTodoInput, CreateTodoSchema, PriorityLevel (+12 more)

### Community 21 - "mobile/package.json"
Cohesion: 0.09
Nodes (22): @babel/core, devDependencies, @babel/core, @types/react, typescript, expo, install, exclude (+14 more)

### Community 22 - "mobile/tsconfig.json"
Cohesion: 0.14
Nodes (13): compilerOptions, baseUrl, paths, strict, extends, include, **/*.ts, **/*.tsx (+5 more)

### Community 23 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

### Community 25 - "decode-google-services.js"
Cohesion: 0.50
Nodes (3): fs, outPath, path

## Knowledge Gaps
- **190 isolated node(s):** `subjects`, `clients`, `priorityConfig`, `QuickAddTaskModalProps`, `EditTaskModalProps` (+185 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@remix-run/cloudflare` connect `verifyBearerToken` to `$id.tsx`, `auth.server.ts`, `compilerOptions`, `server.ts`, `index.ts`, `mobile.callback.tsx`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `types` connect `compilerOptions` to `verifyBearerToken`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `subjects`, `clients`, `priorityConfig` to the rest of the system?**
  _190 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `$id.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09686609686609686 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._