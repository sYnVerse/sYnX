# Graph Report - workspace  (2026-10-29)

## Corpus Check
- 151 files · ~100,611 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .mdc 3, .css 1)

## Summary
- 1358 nodes · 3009 edges · 86 communities (68 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0de91e3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SettingsScreen.tsx
- verifyBearerToken
- compilerOptions
- scripts
- package.json
- server.ts
- auth.server.ts
- AuthContext.tsx
- dependencies
- Cloudflare D1 Database
- with
- worker-configuration.d.ts
- $id.tsx
- TasksScreen.tsx
- Dependabot NPM Package Updates
- ThemeContext.tsx
- env
- BottomTabNavigator.tsx
- expo
- ListsScreen.tsx
- dependencies
- mobile/tsconfig.json
- metro.config.js
- shared/index.ts
- src/shared/index.ts
- Cloudflare Workers Assets
- Remix Framework
- pending-deletes.server.ts
- TaskModal.tsx
- widgetSync.ts
- user-profile.server.ts
- expo-linking
- shared/widget-snapshot.ts
- expo-secure-store
- shared/mobile-ux.ts
- Software Versioning & Breaking Change Rules
- src/shared/time-zone.ts
- mobile/package.json
- BottomTabNavigator.tsx
- overrides
- eslint.config.js
- shared/reminder-time.ts
- src/constants/changelog.ts
- shared/mobile-session.ts
- updates
- react-native-svg
- sync-version.js
- patch-expo-widgets.js
- @tanstack/react-query-persist-client
- devDependencies
- useTheme
- client-storage.ts
- shared/changelog.ts
- TodoItem
- ref_path
- shared/list-permissions.ts
- shared/time-zone.ts
- TodoPage
- widget-progress-ring.js
- vite.config.ts
- shared/todo-completed.ts
- 2. Breaking Change Checklist (Requires MAJOR Bump)
- 2. Breaking Change Checklist (Requires MAJOR Bump)
- mobile/eslint.config.js
- formatReminderTime
- withWidgetProgressRing.js
- @cloudflare/vitest-pool-workers
- @expo/ui
- sync-shared.js
- Software Versioning & Same-Day Fix Policy
- profile-label.ts
- post-build-comment.js
- shared/deep-link.ts
- expo
- expo
- expo-blur
- expo-calendar
- expo-constants@~58.0.13
- expo-web-browser
- react@19.3.0
- react-native-calendars
- react-native-svg@15.16.0
- valibot@^1.4.2

## God Nodes (most connected - your core abstractions)
1. `verifyBearerToken()` - 39 edges
2. `SettingsScreen()` - 39 edges
3. `useTheme()` - 34 edges
4. `TodoManager` - 30 edges
5. `TasksScreen()` - 30 edges
6. `react-native` - 29 edges
7. `action()` - 28 edges
8. `@remix-run/cloudflare` - 27 edges
9. `TodoPage()` - 26 edges
10. `CalendarScreen()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `CalendarView()` --calls--> `applySetCompletedLocal()`  [EXTRACTED]
  app/components/calendar-view.tsx → shared/todo-completed.ts
- `TodoItem()` --calls--> `formatRescheduledToast()`  [EXTRACTED]
  app/routes/$id.tsx → shared/mobile-ux.ts
- `TodoItem()` --calls--> `applySetCompletedLocal()`  [EXTRACTED]
  app/routes/$id.tsx → shared/todo-completed.ts
- `TodoPage()` --calls--> `sortChangelogItems()`  [EXTRACTED]
  app/routes/$id.tsx → shared/changelog.ts
- `TodoPage()` --calls--> `getSharedNameNotice()`  [EXTRACTED]
  app/routes/$id.tsx → shared/list-permissions.ts

## Import Cycles
- None detected.

## Communities (86 total, 18 thin omitted)

### Community 0 - "SettingsScreen.tsx"
Cohesion: 0.05
Nodes (86): secureSessionStore, CalendarPickerModal(), CalendarPickerModalProps, COMPLETED_BEHAVIOR_OPTIONS, SettingsScreen(), loadSettings(), SettingsScreenProps, styles (+78 more)

### Community 1 - "verifyBearerToken"
Cohesion: 0.14
Nodes (25): ListAccessDenial, ListScope, parseListScope(), SerializeListOptions, serializeListRow(), serializeListRows(), verifyBearerToken(), action() (+17 more)

### Community 2 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 3 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, cf-typegen, check, deploy, dev, lint, preview (+4 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (29): description, devDependencies, autoprefixer@10.4.21, @cloudflare/workers-types@^4.20250404.0, eslint@^9.39.4, eslint-import-resolver-typescript@^4.4.5, globals@^17.13.0, postcss@^8.5.15 (+21 more)

### Community 5 - "server.ts"
Cohesion: 0.15
Nodes (19): getRefreshedCookies(), base64UrlEncode(), FCMMessagePayload, getGoogleOAuthToken(), isInvalidTokenResponse(), removeDeviceToken(), sendFCMPushNotification(), signRS256() (+11 more)

### Community 6 - "auth.server.ts"
Cohesion: 0.09
Nodes (45): ACCESS_TOKEN_MAX_AGE_SECONDS, AUTH_REFRESH_COOKIE, AUTH_SESSION_COOKIE, buildAuthClearCookieHeaders(), buildCentralLogoutClearHeaders(), clearAuthRefreshCookie(), clearAuthSessionCookie(), clearPkceCookie() (+37 more)

### Community 7 - "AuthContext.tsx"
Cohesion: 0.05
Nodes (59): expo-secure-store@~58.0.2, API_BASE_URL, axios, AxiosRequestConfig, DEVICE_PUSH_TOKEN_KEY, OPENAUTH_CLIENT_ID, OPENAUTH_ISSUER, OPENAUTH_TOKEN_ENDPOINT (+51 more)

### Community 8 - "dependencies"
Cohesion: 0.10
Nodes (14): dependencies, isbot@5.2.1, @openauthjs/openauth@^0.4.3, react@19.2.8, react-dom@19.2.8, @remix-run/cloudflare@^2.17.5, @remix-run/react@^2.17.5, valibot@^1.4.2 (+6 more)

### Community 10 - "with"
Cohesion: 0.05
Nodes (48): name, outputs, permissions, runs-on, steps, concurrency, cancel-in-progress, group (+40 more)

### Community 12 - "$id.tsx"
Cohesion: 0.09
Nodes (37): CalendarView(), CalendarViewProps, EditTaskModal(), EditTaskModalProps, priorityConfig, QuickAddTaskModal(), QuickAddTaskModalProps, ProfileAvatar() (+29 more)

### Community 13 - "TasksScreen.tsx"
Cohesion: 0.14
Nodes (36): apiClient, ChangelogModal(), ListPermissionBanner(), styles, SubtaskDraft, SubtaskEdit, TaskBreakdownModal(), TaskBreakdownModalProps (+28 more)

### Community 16 - "ThemeContext.tsx"
Cohesion: 0.11
Nodes (30): styles, ChangelogModalProps, styles, FloatingTabBarProps, styles, NotificationSoftAskProps, styles, ScreenContainerProps (+22 more)

### Community 17 - "env"
Cohesion: 0.06
Nodes (31): environment, name, params, type, after, env, environment, name (+23 more)

### Community 18 - "BottomTabNavigator.tsx"
Cohesion: 0.22
Nodes (10): getListAccess(), action(), action(), action(), action(), loader(), action(), TodoManager (+2 more)

### Community 19 - "expo"
Cohesion: 0.08
Nodes (24): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, intentFilters, package, permissions, projectId (+16 more)

### Community 20 - "ListsScreen.tsx"
Cohesion: 0.10
Nodes (29): CATEGORY_OPTIONS, ListsScreen(), ListsScreenProps, ShareModeIcon(), styles, setPinnedWidgetConfig(), getListPermissionPresentation(), getSharedNameNotice() (+21 more)

### Community 21 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, expo-auth-session@~58.0.16, expo-background-task@~58.0.11, expo-haptics@~58.0.7, expo-notifications@~58.1.7, expo-splash-screen@~58.0.12, expo-status-bar@~58.0.4, expo-task-manager@~58.0.12 (+13 more)

### Community 22 - "mobile/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, baseUrl, paths, strict, typeRoots, extends, include, @shared (+1 more)

### Community 23 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

### Community 24 - "shared/index.ts"
Cohesion: 0.08
Nodes (24): action(), readPushTokenForDelete(), CreateListInput, CreateTodoInput, DeleteTargetType, ListOwner, ListScope, PendingDeleteRequest (+16 more)

### Community 25 - "src/shared/index.ts"
Cohesion: 0.08
Nodes (26): ListPermissionBannerProps, styles, TONE_COLORS, CreateListInput, CreateListSchema, CreateTodoInput, CreateTodoSchema, DeleteTargetType (+18 more)

### Community 29 - "pending-deletes.server.ts"
Cohesion: 0.13
Nodes (21): approvePendingDelete(), declinePendingDelete(), DELETE_REQUEST_ALREADY_MESSAGE, DELETE_REQUEST_MESSAGE, DeleteTargetType, describeDeleteTarget(), getPendingDeleteById(), listPendingDeletesForList() (+13 more)

### Community 30 - "TaskModal.tsx"
Cohesion: 0.19
Nodes (20): startOfToday(), styles, TaskModal(), TaskModalProps, usePushPrompt(), PriorityLevel, RecurrencePattern, formatFriendlyDate() (+12 more)

### Community 31 - "widgetSync.ts"
Cohesion: 0.08
Nodes (49): App(), expo-widgets@~58.0.25, resolveMode(), ThemeProvider(), asyncStoragePersister, queryClient, registerWidgetBackgroundSync(), WIDGET_BACKGROUND_SYNC_TASK (+41 more)

### Community 32 - "user-profile.server.ts"
Cohesion: 0.23
Nodes (17): acceptSuggestedDisplayName(), dismissSuggestedDisplayName(), fetchProviderProfile(), PROVIDER_PROFILE_TTL_MS, providerProfileFields(), ProviderProfileInfo, sanitizeProviderAvatarUrl(), syncProviderProfile() (+9 more)

### Community 33 - "expo-linking"
Cohesion: 0.14
Nodes (10): authUrl, bare, cb, client, code, code2, cookie, expected (+2 more)

### Community 34 - "shared/widget-snapshot.ts"
Cohesion: 0.11
Nodes (17): TodoItem, TodoList, BuildSnapshotOptions, CATEGORY_EMOJIS, isRecurringWidgetTask(), ListWidgetSnapshot, mergePendingOpsIntoSnapshot(), PRIORITY_ORDER (+9 more)

### Community 35 - "expo-secure-store"
Cohesion: 0.15
Nodes (13): scripts, android, doctor, eas-build-pre-install, ios, lint, postinstall, prebuild (+5 more)

### Community 36 - "shared/mobile-ux.ts"
Cohesion: 0.11
Nodes (8): contrastRatio(), FLOATING_TAB_BAR_HEIGHT, PriorityLevel, PushPermissionStatus, relativeLuminance(), ShareMode, SOFT_ASK_REASK_MS, SoftAskPolicyInput

### Community 37 - "Software Versioning & Breaking Change Rules"
Cohesion: 0.06
Nodes (28): Checks (CI runs these), Database schema (D1 migrations), graphify, Mobile dependency check (expo-doctor), 1. Semantic Versioning (SemVer), 2. Breaking Change Checklist (Requires MAJOR), 3. When to bump vs append (same calendar day), 4. Mobile vs web (separate version lines) (+20 more)

### Community 38 - "src/shared/time-zone.ts"
Cohesion: 0.20
Nodes (15): addCalendarInterval(), daysInMonth(), formatterCache, fromWallClock(), getFormatter(), toWallClock(), WallClock, wallClockAsUtc() (+7 more)

### Community 39 - "mobile/package.json"
Cohesion: 0.13
Nodes (14): axios@^1.7.7, expo-linking@~58.0.15, expo-system-ui@~58.0.7, react-native-screens@~4.30.0, @tanstack/react-query-persist-client@^5.59.0, main, name, private (+6 more)

### Community 40 - "BottomTabNavigator.tsx"
Cohesion: 0.21
Nodes (13): FloatingTabBar(), TabType, ScreenContainer(), useAuth(), BottomTabNavigator(), fetchOrCreateActiveListId(), MainAppContent(), styles (+5 more)

### Community 41 - "overrides"
Cohesion: 0.12
Nodes (16): undici, overrides, estree-util-value-to-estree, miniflare, postcss-modules-local-by-default, postcss-modules-scope, postcss-nested, qs (+8 more)

### Community 42 - "eslint.config.js"
Cohesion: 0.14
Nodes (12): @eslint/js@^9.39.5, eslint-plugin-import@^2.32.0, eslint-plugin-jsx-a11y@^6.10.2, eslint-plugin-react@^7.37.5, eslint-plugin-react-hooks@^7.1.1, typescript-eslint@^8.72.1, @eslint/js, eslint-plugin-import (+4 more)

### Community 43 - "shared/reminder-time.ts"
Cohesion: 0.19
Nodes (9): formatFriendlyDate(), defaultPickerValue(), formatReminderPillLabel(), formatReminderPreview(), localDayIndex(), nextFullHour(), ReminderPreview, ReminderSelection (+1 more)

### Community 44 - "src/constants/changelog.ts"
Cohesion: 0.22
Nodes (9): MOBILE_CHANGELOG, CHANGELOG_CATEGORY_ORDER, ChangelogCategory, changelogCategoryRank(), ChangelogItem, ReleaseNote, sortChangelogItems(), MOBILE_APP_VERSION (+1 more)

### Community 45 - "shared/mobile-session.ts"
Cohesion: 0.18
Nodes (11): createSessionRefreshController(), performRefresh(), refresh(), MOBILE_ACCESS_TOKEN_KEY, MOBILE_REFRESH_TOKEN_KEY, parseTokenError(), RefreshFailureReason, RefreshResult (+3 more)

### Community 46 - "updates"
Cohesion: 0.17
Nodes (11): dependency-type, production-dependencies, patterns, interval, updates, allow, directory, groups (+3 more)

### Community 47 - "react-native-svg"
Cohesion: 0.25
Nodes (8): cloudflare, categories, dash, docs_url, icon_urls, label, preview_image_url, products

### Community 48 - "sync-version.js"
Cohesion: 0.17
Nodes (10): appJson, appJsonPath, fs, mobileShared, path, pkg, pkgPath, repoShared (+2 more)

### Community 49 - "patch-expo-widgets.js"
Cohesion: 0.18
Nodes (9): expoWidgetsDir, fs, interactionActionPath, path, peekWidgetPath, widgetObjectPath, widgetsDtsPath, widgetsJsPath (+1 more)

### Community 50 - "@tanstack/react-query-persist-client"
Cohesion: 0.27
Nodes (6): b64url(), codes, PORT, readBody(), s256(), server

### Community 51 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @babel/core@^7.24.0, eslint@^9.39.5, globals@^17.13.0, @types/react@~19.3.0, typescript@^5.7.2, eslint, globals (+3 more)

### Community 52 - "useTheme"
Cohesion: 0.25
Nodes (9): copyFor(), ListAccessErrorKind, ListAccessErrorState(), ListAccessErrorStateProps, styles, ListCardSkeleton(), styles, TaskCardSkeleton() (+1 more)

### Community 53 - "client-storage.ts"
Cohesion: 0.31
Nodes (9): listeners, memory, noopSubscribe(), notify(), readStoredValue(), subscribe(), useHydrated(), useStoredValue() (+1 more)

### Community 54 - "shared/changelog.ts"
Cohesion: 0.24
Nodes (8): WEB_CHANGELOG, WEB_VERSION, CHANGELOG_CATEGORY_ORDER, ChangelogCategory, changelogCategoryRank(), ChangelogItem, ReleaseNote, sortChangelogItems()

### Community 55 - "TodoItem"
Cohesion: 0.20
Nodes (6): DurationPicker(), formatReminder(), PriorityPicker(), RecurrencePicker(), ReminderPicker(), TodoItem()

### Community 56 - "ref_path"
Cohesion: 0.22
Nodes (5): fs, path, fs, outPath, path

### Community 57 - "shared/list-permissions.ts"
Cohesion: 0.20
Nodes (8): getSharedNameNotice(), getShareModeLabel(), isMakingListPublic(), ListAccessDenialCode, ListPermissionInput, ListPermissionPresentation, ListPermissionTone, ShareMode

### Community 58 - "shared/time-zone.ts"
Cohesion: 0.40
Nodes (9): addCalendarInterval(), daysInMonth(), formatterCache, fromWallClock(), getFormatter(), toWallClock(), WallClock, wallClockAsUtc() (+1 more)

### Community 59 - "TodoPage"
Cohesion: 0.22
Nodes (8): EmptyState(), parseGuestLists(), ProgressRing(), requestNotificationPermission(), Toast(), TodoPage(), describeTimeZone(), listTimeZones()

### Community 60 - "widget-progress-ring.js"
Cohesion: 0.44
Nodes (8): allRingDrawables(), clampPercent(), fmt(), RING_THEMES, ringArcPath(), ringDrawableName(), ringTrackPath(), ringVectorXml()

### Community 61 - "vite.config.ts"
Cohesion: 0.22
Nodes (8): @remix-run/dev@^2.17.4, vite@^5.4.21, vite-tsconfig-paths@5.1.4, @remix-run/dev, vite, vite-tsconfig-paths, Future, @remix-run/cloudflare

### Community 62 - "shared/todo-completed.ts"
Cohesion: 0.33
Nodes (8): getLocalTimeZone(), isValidTimeZone(), applySetCompletedLocal(), isRecurring(), nextReminderAt(), SetCompletedFields, SetCompletedLocalResult, applyReplayedWidgetOpsToTodos()

### Community 63 - "2. Breaking Change Checklist (Requires MAJOR Bump)"
Cohesion: 0.25
Nodes (7): 1. Semantic Versioning (SemVer) Format, 2. Breaking Change Checklist (Requires MAJOR Bump), 3. Same-Day Versioning Policy, Compile-Time / Code Level, Data & Architecture, Runtime / Behavioral, Software Versioning & Breaking Change Rules for Antigravity AI

### Community 64 - "2. Breaking Change Checklist (Requires MAJOR Bump)"
Cohesion: 0.29
Nodes (6): 1. Semantic Versioning (SemVer) Format, 2. Breaking Change Checklist (Requires MAJOR Bump), Compile-Time / Code Level, Data & Architecture, Runtime / Behavioral, Software Versioning & Breaking Change Rules for Antigravity AI

### Community 65 - "mobile/eslint.config.js"
Cohesion: 0.29
Nodes (5): { defineConfig }, expoConfig, globals, eslint-config-expo@~58.0.4, eslint-config-expo

### Community 66 - "formatReminderTime"
Cohesion: 0.33
Nodes (7): formatReminderTime(), listOwnershipLabel(), stripLeadingCategoryEmoji(), applyWidgetTaskCompletion(), buildListWidgetSnapshot(), buildUpNextWidgetSnapshot(), getCategoryEmoji()

### Community 67 - "withWidgetProgressRing.js"
Cohesion: 0.33
Nodes (4): fs, path, { withDangerousMod }, withWidgetProgressRing()

### Community 68 - "@cloudflare/vitest-pool-workers"
Cohesion: 0.33
Nodes (4): @cloudflare/vitest-pool-workers@^0.16.10, vitest@^4.1.0, @cloudflare/vitest-pool-workers, vitest

### Community 69 - "@expo/ui"
Cohesion: 0.40
Nodes (4): @expo/ui@~58.0.25, ButtonProps, @expo/ui/jetpack-compose, @expo/ui

### Community 70 - "sync-shared.js"
Cohesion: 0.40
Nodes (4): fs, mobileSharedDir, path, rootSharedDir

### Community 71 - "Software Versioning & Same-Day Fix Policy"
Cohesion: 0.50
Nodes (3): 1. Semantic Versioning (SemVer) Format, 2. Same-Day Versioning Policy (CRITICAL), Software Versioning & Same-Day Fix Policy

### Community 72 - "profile-label.ts"
Cohesion: 0.67
Nodes (3): getProfileLabel(), initialsFromName(), ProfileLabel

### Community 74 - "post-build-comment.js"
Cohesion: 0.83
Nodes (3): body(), gh(), main()

### Community 76 - "expo"
Cohesion: 0.67
Nodes (3): expo, install, exclude

## Knowledge Gaps
- **5 isolated node(s):** `expo/tsconfig.base`, `Dependabot NPM Package Updates`, `Cloudflare D1 Database`, `Remix Framework`, `Cloudflare Workers Assets`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 511 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo` connect `expo` to `withWidgetProgressRing.js`, `mobile/package.json`, `metro.config.js`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `expo/tsconfig.base`, `Dependabot NPM Package Updates`, `Cloudflare D1 Database` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SettingsScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05327281414237936 - nodes in this community are weakly interconnected._
- **Why does `@remix-run/cloudflare` connect `verifyBearerToken` to `user-profile.server.ts`, `package.json`, `server.ts`, `auth.server.ts`, `dependencies`, `mobile.callback.tsx`, `$id.tsx`, `BottomTabNavigator.tsx`, `shared/index.ts`, `pending-deletes.server.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `verifyBearerToken` be split into smaller, more focused modules?**
  _Cohesion score 0.1431451612903226 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `ThemeContext.tsx` to `SettingsScreen.tsx`, `mobile/package.json`, `AuthContext.tsx`, `BottomTabNavigator.tsx`, `TasksScreen.tsx`, `useTheme`, `dependencies`, `ListsScreen.tsx`, `src/shared/index.ts`, `TaskModal.tsx`, `widgetSync.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._