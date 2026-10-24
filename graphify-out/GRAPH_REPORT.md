# Graph Report - to-do-list  (2026-10-24)

## Corpus Check
- 112 files · ~227,842 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 770 nodes · 1227 edges · 67 communities (57 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9aacad28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_$id.tsx|$id.tsx]]
- [[_COMMUNITY_TodoManager|TodoManager]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_server.ts|server.ts]]
- [[_COMMUNITY_auth.server.ts|auth.server.ts]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_Cloudflare D1 Database|Cloudflare D1 Database]]
- [[_COMMUNITY_worker-configuration.d.ts|worker-configuration.d.ts]]
- [[_COMMUNITY_Dependabot NPM Package Updates|Dependabot NPM Package Updates]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_BottomTabNavigator.tsx|BottomTabNavigator.tsx]]
- [[_COMMUNITY_expo|expo]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_mobilepackage.json|mobile/package.json]]
- [[_COMMUNITY_mobiletsconfig.json|mobile/tsconfig.json]]
- [[_COMMUNITY_metro.config.js|metro.config.js]]
- [[_COMMUNITY_mobile.callback.tsx|mobile.callback.tsx]]
- [[_COMMUNITY_decode-google-services.js|decode-google-services.js]]
- [[_COMMUNITY_Cloudflare Workers Assets|Cloudflare Workers Assets]]
- [[_COMMUNITY_Remix Framework|Remix Framework]]
- [[_COMMUNITY_expo-auth-session|expo-auth-session]]
- [[_COMMUNITY_expo-blur|expo-blur]]
- [[_COMMUNITY_expo-constants|expo-constants]]
- [[_COMMUNITY_expo-haptics|expo-haptics]]
- [[_COMMUNITY_expo-linking|expo-linking]]
- [[_COMMUNITY_expo-notifications|expo-notifications]]
- [[_COMMUNITY_expo-secure-store|expo-secure-store]]
- [[_COMMUNITY_expo-splash-screen|expo-splash-screen]]
- [[_COMMUNITY_expo-status-bar|expo-status-bar]]
- [[_COMMUNITY_expo-system-ui|expo-system-ui]]
- [[_COMMUNITY_expo-web-browser|expo-web-browser]]
- [[_COMMUNITY_lucide-react-native|lucide-react-native]]
- [[_COMMUNITY_react|react]]
- [[_COMMUNITY_react-native|react-native]]
- [[_COMMUNITY_@react-native-async-storageasync-storage|@react-native-async-storage/async-storage]]
- [[_COMMUNITY_react-native-calendars|react-native-calendars]]
- [[_COMMUNITY_react-native-safe-area-context|react-native-safe-area-context]]
- [[_COMMUNITY_react-native-screens|react-native-screens]]
- [[_COMMUNITY_react-native-svg|react-native-svg]]
- [[_COMMUNITY_@tanstackquery-async-storage-persister|@tanstack/query-async-storage-persister]]
- [[_COMMUNITY_@tanstackreact-query|@tanstack/react-query]]
- [[_COMMUNITY_@tanstackreact-query-persist-client|@tanstack/react-query-persist-client]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 32 edges
2. `verifyBearerToken()` - 31 edges
3. `TodoManager` - 23 edges
4. `ensureUserProfileSchema()` - 20 edges
5. `getListAccess()` - 16 edges
6. `compilerOptions` - 16 edges
7. `useToast()` - 15 edges
8. `expo` - 13 edges
9. `typography` - 12 edges
10. `resolveDisplayName()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `sendFCMPushNotification()` --calls--> `fetch()`  [INFERRED]
  app/fcm.server.ts → server.ts
- `getGoogleOAuthToken()` --calls--> `fetch()`  [INFERRED]
  app/fcm.server.ts → server.ts
- `fetch()` --calls--> `getRefreshedCookies()`  [EXTRACTED]
  server.ts → app/auth.server.ts
- `scheduled()` --calls--> `sendFCMPushNotification()`  [EXTRACTED]
  server.ts → app/fcm.server.ts
- `scheduled()` --calls--> `buildReminderEmailHtml()`  [EXTRACTED]
  server.ts → app/html-escape.server.ts

## Import Cycles
- None detected.

## Communities (67 total, 10 thin omitted)

### Community 0 - "$id.tsx"
Cohesion: 0.11
Nodes (23): ChangelogModal(), ChangelogModalProps, styles, NotificationSoftAsk(), NotificationSoftAskProps, styles, ScreenContainer(), ScreenContainerProps (+15 more)

### Community 1 - "TodoManager"
Cohesion: 0.05
Nodes (52): getListAccess(), ListAccessDenial, ListScope, parseListScope(), SerializeListOptions, serializeListRow(), serializeListRows(), verifyBearerToken() (+44 more)

### Community 2 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+11 more)

### Community 3 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, cf-typegen, check, deploy, dev, lint, preview (+3 more)

### Community 4 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, autoprefixer, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, eslint, postcss, @remix-run/dev, tailwindcss (+9 more)

### Community 5 - "server.ts"
Cohesion: 0.16
Nodes (16): getRefreshedCookies(), base64UrlEncode(), FCMMessagePayload, getGoogleOAuthToken(), sendFCMPushNotification(), signRS256(), buildReminderEmailHtml(), escapeHtml() (+8 more)

### Community 6 - "auth.server.ts"
Cohesion: 0.12
Nodes (34): buildAuthClearCookieHeaders(), buildCentralLogoutClearHeaders(), clearAuthRefreshCookie(), clearAuthSessionCookie(), clearPkceCookie(), getCookieAttributes(), getCookieDomain(), getPkceCookieAttributes() (+26 more)

### Community 7 - "dependencies"
Cohesion: 0.08
Nodes (25): CreateListInput, CreateListSchema, CreateTodoInput, CreateTodoSchema, ListOwner, ListScope, PriorityLevel, PriorityLevelSchema (+17 more)

### Community 8 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, isbot, @openauthjs/openauth, react, react-dom, @remix-run/cloudflare, @remix-run/react, valibot

### Community 18 - "BottomTabNavigator.tsx"
Cohesion: 0.16
Nodes (11): AuthProvider(), ThemeProvider(), styles, ToastContext, ToastContextType, ToastProvider(), ToastState, ToastTone (+3 more)

### Community 19 - "expo"
Cohesion: 0.08
Nodes (24): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, intentFilters, package, permissions, projectId (+16 more)

### Community 20 - "index.ts"
Cohesion: 0.08
Nodes (25): CreateListInput, CreateListSchema, CreateTodoInput, CreateTodoSchema, ListOwner, ListScope, PriorityLevel, PriorityLevelSchema (+17 more)

### Community 21 - "mobile/package.json"
Cohesion: 0.04
Nodes (48): dependencies, axios, expo, expo-auth-session, expo-blur, expo-calendar, expo-constants, expo-haptics (+40 more)

### Community 22 - "mobile/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, baseUrl, paths, strict, typeRoots, extends, include, @/* (+1 more)

### Community 23 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

### Community 24 - "mobile.callback.tsx"
Cohesion: 0.16
Nodes (16): PushPromptContext, PushPromptContextType, PushPromptProvider(), PushPromptProviderProps, clearSoftAskDeclined(), ensureAndroidReminderChannel(), getPushPermissionStatus(), hasStoredPushToken() (+8 more)

### Community 25 - "decode-google-services.js"
Cohesion: 0.19
Nodes (13): styles, SubtaskDraft, TaskBreakdownModal(), TaskBreakdownModalProps, useToast(), SetCompletedResult, SetCompletedVars, useSetTodoCompleted() (+5 more)

### Community 29 - "expo-auth-session"
Cohesion: 0.11
Nodes (8): contrastRatio(), formatFriendlyDate(), formatRescheduledToast(), PriorityLevel, PushPermissionStatus, relativeLuminance(), ShareMode, SoftAskPolicyInput

### Community 30 - "expo-blur"
Cohesion: 0.11
Nodes (8): contrastRatio(), formatFriendlyDate(), formatRescheduledToast(), PriorityLevel, PushPermissionStatus, relativeLuminance(), ShareMode, SoftAskPolicyInput

### Community 31 - "expo-constants"
Cohesion: 0.17
Nodes (10): apiClient, REFRESH_TOKEN_KEY, RetriableConfig, secureSessionStore, sessionRefresh, setAuthFailureHandler(), TOKEN_KEY, AuthContext (+2 more)

### Community 32 - "expo-haptics"
Cohesion: 0.19
Nodes (11): ListPermissionBanner(), ListPermissionBannerProps, styles, TONE_COLORS, styles, TaskModal(), TaskModalProps, usePushPrompt() (+3 more)

### Community 33 - "expo-linking"
Cohesion: 0.14
Nodes (10): authUrl, bare, cb, client, code, code2, cookie, expected (+2 more)

### Community 34 - "expo-notifications"
Cohesion: 0.17
Nodes (11): 1. Semantic Versioning (SemVer), 2. Breaking Change Checklist (Requires MAJOR), 3. When to bump vs append (same calendar day), 4. Mobile vs web (separate version lines), 5. Pre-finish checklist, Android `versionCode` / iOS `buildNumber`, Compile-time / code level, Data & architecture (+3 more)

### Community 35 - "expo-secure-store"
Cohesion: 0.23
Nodes (8): FloatingTabBar(), FloatingTabBarProps, styles, TabType, useAuth(), MainAppContent(), styles, SettingsScreen()

### Community 36 - "expo-splash-screen"
Cohesion: 0.24
Nodes (8): ListCardSkeleton(), styles, TaskCardSkeleton(), useTheme(), CATEGORY_OPTIONS, ListsScreen(), ListsScreenProps, styles

### Community 37 - "expo-status-bar"
Cohesion: 0.17
Nodes (11): 1. Semantic Versioning (SemVer) Format, 2. Breaking Change Checklist (Requires MAJOR Bump), Apply Locally, Compile-Time / Code Level, Data & Architecture, Database Migration Setup, Getting Started, Key Features (+3 more)

### Community 38 - "expo-system-ui"
Cohesion: 0.17
Nodes (10): appJson, appJsonPath, fs, mobileShared, path, pkg, pkgPath, repoShared (+2 more)

### Community 39 - "expo-web-browser"
Cohesion: 0.38
Nodes (10): checkCalendarPermissions(), getEventMappings(), getOrCreateSynxCalendar(), isCalendarSyncEnabled(), removeTaskFromNativeCalendar(), requestCalendarPermissions(), saveEventMappings(), setCalendarSyncEnabled() (+2 more)

### Community 40 - "lucide-react-native"
Cohesion: 0.20
Nodes (5): Bundle, ReactActivity, ReactActivityDelegate, String, MainActivity

### Community 41 - "react"
Cohesion: 0.20
Nodes (9): description, engines, node, name, overrides, estree-util-value-to-estree, tar, sideEffects (+1 more)

### Community 42 - "react-native"
Cohesion: 0.22
Nodes (5): RefreshFailureReason, RefreshResult, SessionRefreshController, SessionTokenStore, TokenSet

### Community 43 - "@react-native-async-storage/async-storage"
Cohesion: 0.22
Nodes (5): RefreshFailureReason, RefreshResult, SessionRefreshController, SessionTokenStore, TokenSet

### Community 44 - "react-native-calendars"
Cohesion: 0.25
Nodes (7): 1. Semantic Versioning (SemVer) Format, 2. Breaking Change Checklist (Requires MAJOR Bump), Compile-Time / Code Level, Data & Architecture, Runtime / Behavioral, Software Versioning & Breaking Change Rules for Antigravity AI, 3. Same-Day Versioning Policy

### Community 45 - "react-native-safe-area-context"
Cohesion: 0.25
Nodes (5): Application, Configuration, ReactApplication, ReactHost, MainApplication

### Community 46 - "react-native-screens"
Cohesion: 0.25
Nodes (5): ListAccessDenialCode, ListPermissionInput, ListPermissionPresentation, ListPermissionTone, ShareMode

### Community 47 - "react-native-svg"
Cohesion: 0.25
Nodes (8): cloudflare, categories, dash, docs_url, icon_urls, label, preview_image_url, products

### Community 48 - "@tanstack/query-async-storage-persister"
Cohesion: 0.25
Nodes (5): ListAccessDenialCode, ListPermissionInput, ListPermissionPresentation, ListPermissionTone, ShareMode

### Community 49 - "@tanstack/react-query"
Cohesion: 0.29
Nodes (6): 1. Semantic Versioning (SemVer) Format, 2. Breaking Change Checklist (Requires MAJOR Bump), Compile-Time / Code Level, Data & Architecture, Runtime / Behavioral, Software Versioning & Breaking Change Rules for Antigravity AI

### Community 50 - "@tanstack/react-query-persist-client"
Cohesion: 0.33
Nodes (5): b64url(), codes, PORT, s256(), server

### Community 51 - "Community 51"
Cohesion: 0.40
Nodes (5): copyFor(), ListAccessErrorKind, ListAccessErrorState(), ListAccessErrorStateProps, styles

### Community 52 - "Community 52"
Cohesion: 0.47
Nodes (5): applySetCompletedLocal(), isRecurring(), nextReminderAt(), SetCompletedFields, SetCompletedLocalResult

### Community 53 - "Community 53"
Cohesion: 0.47
Nodes (5): applySetCompletedLocal(), isRecurring(), nextReminderAt(), SetCompletedFields, SetCompletedLocalResult

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (4): fs, mobileSharedDir, path, rootSharedDir

### Community 55 - "Community 55"
Cohesion: 0.50
Nodes (3): 1. Semantic Versioning (SemVer) Format, 2. Same-Day Versioning Policy (CRITICAL), Software Versioning & Same-Day Fix Policy

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (3): ChangelogCategory, ChangelogItem, ReleaseNote

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (3): fs, outPath, path

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (3): ChangelogCategory, ChangelogItem, ReleaseNote

## Knowledge Gaps
- **356 isolated node(s):** `ListAccessDenial`, `ListScope`, `SerializeListOptions`, `subjects`, `clients` (+351 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TodoManager` connect `TodoManager` to `auth.server.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `useTheme()` connect `expo-splash-screen` to `$id.tsx`, `expo-haptics`, `expo-secure-store`, `BottomTabNavigator.tsx`, `Community 51`, `decode-google-services.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `verifyBearerToken()` connect `TodoManager` to `auth.server.ts`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `ListAccessDenial`, `ListScope`, `SerializeListOptions` to the rest of the system?**
  _356 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `$id.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11264367816091954 - nodes in this community are weakly interconnected._
- **Should `TodoManager` be split into smaller, more focused modules?**
  _Cohesion score 0.05112560488112771 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._