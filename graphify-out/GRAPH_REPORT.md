# Graph Report - workspace  (2026-07-30)

## Corpus Check
- 61 files · ~179,220 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 470 nodes · 697 edges · 51 communities (23 shown, 28 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b2cb8bb7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- $id.tsx
- TodoManager
- compilerOptions
- scripts
- devDependencies
- server.ts
- auth.server.ts
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
- expo-auth-session
- expo-blur
- expo-constants
- expo-haptics
- expo-linking
- expo-notifications
- expo-secure-store
- expo-splash-screen
- expo-status-bar
- expo-system-ui
- expo-web-browser
- lucide-react-native
- react
- react-native
- @react-native-async-storage/async-storage
- react-native-calendars
- react-native-safe-area-context
- react-native-screens
- react-native-svg
- @tanstack/query-async-storage-persister
- @tanstack/react-query
- @tanstack/react-query-persist-client

## God Nodes (most connected - your core abstractions)
1. `verifyBearerToken()` - 25 edges
2. `@remix-run/cloudflare` - 21 edges
3. `TodoManager` - 20 edges
4. `useTheme()` - 20 edges
5. `compilerOptions` - 16 edges
6. `expo` - 13 edges
7. `getListAccess()` - 12 edges
8. `action()` - 11 edges
9. `scripts` - 11 edges
10. `include` - 10 edges

## Surprising Connections (you probably didn't know these)
- `TaskBreakdownModalProps` --references--> `TodoItem`  [EXTRACTED]
  mobile/src/components/TaskBreakdownModal.tsx → shared/index.ts
- `loader()` --calls--> `getOptionalUser()`  [EXTRACTED]
  app/routes/$id.tsx → app/auth.server.ts
- `scheduled()` --calls--> `sendFCMPushNotification()`  [EXTRACTED]
  server.ts → app/fcm.server.ts
- `fetch()` --calls--> `getLoadContext()`  [EXTRACTED]
  server.ts → load-context.ts
- `TaskModalProps` --references--> `PriorityLevel`  [EXTRACTED]
  mobile/src/components/TaskModal.tsx → shared/index.ts

## Import Cycles
- None detected.

## Communities (51 total, 28 thin omitted)

### Community 0 - "$id.tsx"
Cohesion: 0.10
Nodes (18): CalendarView(), CalendarViewProps, EditTaskModalProps, priorityConfig, QuickAddTaskModalProps, Filter, formatReminder(), GuestContext (+10 more)

### Community 1 - "TodoManager"
Cohesion: 0.31
Nodes (3): action(), action(), TodoManager

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

### Community 6 - "auth.server.ts"
Cohesion: 0.09
Nodes (32): getListAccess(), clients, getAuthClient(), getAuthSettings(), getClientID(), getCookieAttributes(), getCookieDomain(), getOptionalUser() (+24 more)

### Community 7 - "dependencies"
Cohesion: 0.29
Nodes (7): axios, expo, dependencies, axios, expo, valibot, valibot

### Community 8 - "dependencies"
Cohesion: 0.13
Nodes (15): isbot, @openauthjs/openauth, dependencies, isbot, @openauthjs/openauth, react, react-dom, @remix-run/cloudflare (+7 more)

### Community 18 - "BottomTabNavigator.tsx"
Cohesion: 0.08
Nodes (34): plugins, apiClient, FloatingTabBar(), FloatingTabBarProps, styles, TabType, AuthContext, AuthContextType (+26 more)

### Community 19 - "expo"
Cohesion: 0.07
Nodes (26): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, intentFilters, package, permissions, projectId (+18 more)

### Community 20 - "index.ts"
Cohesion: 0.08
Nodes (36): ListCardSkeleton(), styles, TaskCardSkeleton(), styles, SubtaskItemState, TaskBreakdownModal(), TaskBreakdownModalProps, styles (+28 more)

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
- **201 isolated node(s):** `subjects`, `clients`, `priorityConfig`, `QuickAddTaskModalProps`, `FCMMessagePayload` (+196 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@remix-run/cloudflare` connect `auth.server.ts` to `$id.tsx`, `compilerOptions`, `server.ts`, `root.tsx`, `mobile.callback.tsx`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `types` connect `compilerOptions` to `auth.server.ts`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `subjects`, `clients`, `priorityConfig` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `$id.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._