# Graph Report - to-do-list  (2026-11-02)

## Corpus Check
- 172 files · ~272,553 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1293 nodes · 2307 edges · 90 communities (79 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `79b6e8e5`
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
- [[_COMMUNITY_.eslintrc.js|.eslintrc.js]]
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
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]

## God Nodes (most connected - your core abstractions)
1. `verifyBearerToken()` - 42 edges
2. `useTheme()` - 42 edges
3. `overrides` - 25 edges
4. `TodoManager` - 24 edges
5. `action()` - 23 edges
6. `logListActivity()` - 21 edges
7. `getListAccess()` - 19 edges
8. `useToast()` - 17 edges
9. `apiClient` - 16 edges
10. `typography` - 16 edges

## Surprising Connections (you probably didn't know these)
- `sendFCMPushNotification()` --calls--> `fetch()`  [INFERRED]
  app/fcm.server.ts → server.ts
- `getGoogleOAuthToken()` --calls--> `fetch()`  [INFERRED]
  app/fcm.server.ts → server.ts
- `gh()` --calls--> `fetch()`  [INFERRED]
  mobile/scripts/post-build-comment.js → server.ts
- `fetch()` --calls--> `getRefreshedCookies()`  [EXTRACTED]
  server.ts → app/auth.server.ts
- `scheduled()` --calls--> `getDueReminderRecipients()`  [EXTRACTED]
  server.ts → app/due-reminders.server.ts

## Import Cycles
- None detected.

## Communities (90 total, 11 thin omitted)

### Community 0 - "$id.tsx"
Cohesion: 0.11
Nodes (25): CompletedSectionHeader(), CompletedSectionHeaderProps, styles, copyFor(), ListAccessErrorKind, ListAccessErrorState(), ListAccessErrorStateProps, styles (+17 more)

### Community 1 - "TodoManager"
Cohesion: 0.06
Nodes (26): listeners, memory, notify(), readStoredValue(), useHydrated(), useStoredValue(), writeStoredValue(), GuestActionPayload (+18 more)

### Community 2 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+11 more)

### Community 3 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, cf-typegen, check, deploy, dev, lint, preview (+4 more)

### Community 4 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, autoprefixer, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, eslint, eslint-import-resolver-typescript, @eslint/js, eslint-plugin-import (+15 more)

### Community 5 - "server.ts"
Cohesion: 0.09
Nodes (31): getRefreshedCookies(), DueReminderRow, getDueReminderRecipients(), base64UrlEncode(), FCMMessagePayload, getGoogleOAuthToken(), isInvalidTokenResponse(), removeDeviceToken() (+23 more)

### Community 6 - "auth.server.ts"
Cohesion: 0.07
Nodes (42): buildAuthClearCookieHeaders(), buildCentralLogoutClearHeaders(), clearAuthRefreshCookie(), clearAuthSessionCookie(), clearPkceCookie(), getCookieAttributes(), getCookieDomain(), getPkceCookieAttributes() (+34 more)

### Community 7 - "dependencies"
Cohesion: 0.06
Nodes (30): CreateListInput, CreateListSchema, CreateTodoInput, CreateTodoSchema, DeleteTargetType, ListActivityAction, ListActivityActorType, ListActivityEntry (+22 more)

### Community 8 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, isbot, @openauthjs/openauth, react, react-dom, @remix-run/cloudflare, @remix-run/react, valibot

### Community 13 - ".eslintrc.js"
Cohesion: 0.20
Nodes (21): getListAccess(), ListAccessDenial, ListRow, ListScope, parseListScope(), SerializeListOptions, serializeListRow(), serializeListRows() (+13 more)

### Community 17 - "CLAUDE.md"
Cohesion: 0.08
Nodes (24): Checks (CI runs these), Database schema (D1 migrations), graphify, Mobile dependency check (expo-doctor), Versioning Rules (SemVer), Worker Previews (pull request previews), Change the schema, Database schema and migrations (+16 more)

### Community 18 - "BottomTabNavigator.tsx"
Cohesion: 0.16
Nodes (17): CalendarPickerModal(), CalendarPickerModalProps, styles, COMPLETED_BEHAVIOR_OPTIONS, SettingsScreen(), SettingsScreenProps, styles, AvailableCalendar (+9 more)

### Community 19 - "expo"
Cohesion: 0.08
Nodes (24): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, intentFilters, package, permissions, projectId (+16 more)

### Community 20 - "index.ts"
Cohesion: 0.06
Nodes (30): CreateListInput, CreateListSchema, CreateTodoInput, CreateTodoSchema, DeleteTargetType, ListActivityAction, ListActivityActorType, ListActivityEntry (+22 more)

### Community 21 - "mobile/package.json"
Cohesion: 0.06
Nodes (31): dependencies, axios, expo, expo-auth-session, expo-background-task, expo-blur, expo-calendar, expo-constants (+23 more)

### Community 22 - "mobile/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, baseUrl, paths, strict, typeRoots, extends, include, @/* (+1 more)

### Community 23 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

### Community 24 - "mobile.callback.tsx"
Cohesion: 0.09
Nodes (42): applyCompletedTreatment(), buildCompletedEventNotes(), buildCompletedEventTitle(), buildTaskEventNotes(), CalendarPermissionResult, CalendarPermissionStatus, calendarQueue, checkCalendarPermissions() (+34 more)

### Community 25 - "decode-google-services.js"
Cohesion: 0.10
Nodes (15): buildListWidgetSnapshot(), BuildSnapshotOptions, buildUpNextWidgetSnapshot(), CATEGORY_EMOJIS, getCategoryEmoji(), ListWidgetSnapshot, mergePendingOpsIntoSnapshot(), PRIORITY_ORDER (+7 more)

### Community 29 - "expo-auth-session"
Cohesion: 0.10
Nodes (8): contrastRatio(), formatFriendlyDate(), formatRescheduledToast(), PriorityLevel, PushPermissionStatus, relativeLuminance(), ShareMode, SoftAskPolicyInput

### Community 30 - "expo-blur"
Cohesion: 0.10
Nodes (8): contrastRatio(), formatFriendlyDate(), formatRescheduledToast(), PriorityLevel, PushPermissionStatus, relativeLuminance(), ShareMode, SoftAskPolicyInput

### Community 31 - "expo-constants"
Cohesion: 0.05
Nodes (56): REFRESH_TOKEN_KEY, secureSessionStore, sessionRefresh, setAuthFailureHandler(), TOKEN_KEY, AuthContext, AuthContextType, AuthProvider() (+48 more)

### Community 32 - "expo-haptics"
Cohesion: 0.10
Nodes (15): buildListWidgetSnapshot(), BuildSnapshotOptions, buildUpNextWidgetSnapshot(), CATEGORY_EMOJIS, getCategoryEmoji(), ListWidgetSnapshot, mergePendingOpsIntoSnapshot(), PRIORITY_ORDER (+7 more)

### Community 33 - "expo-linking"
Cohesion: 0.14
Nodes (10): authUrl, bare, cb, client, code, code2, cookie, expected (+2 more)

### Community 34 - "expo-notifications"
Cohesion: 0.15
Nodes (12): 1. Semantic Versioning (SemVer), 2. Breaking Change Checklist (Requires MAJOR), 3. When to bump vs append (same calendar day), 4. Mobile vs web (separate version lines), 5. Changelog item order, 6. Pre-finish checklist, Android `versionCode` / iOS `buildNumber`, Compile-time / code level (+4 more)

### Community 35 - "expo-secure-store"
Cohesion: 0.15
Nodes (13): scripts, android, doctor, eas-build-pre-install, ios, lint, postinstall, prebuild (+5 more)

### Community 36 - "expo-splash-screen"
Cohesion: 0.18
Nodes (9): expoWidgetsDir, fs, interactionActionPath, path, peekWidgetPath, widgetObjectPath, widgetsDtsPath, widgetsJsPath (+1 more)

### Community 37 - "expo-status-bar"
Cohesion: 0.15
Nodes (17): PushPromptContext, PushPromptContextType, PushPromptProvider(), PushPromptProviderProps, clearSoftAskDeclined(), ensureAndroidReminderChannel(), getPushPermissionStatus(), hasStoredPushToken() (+9 more)

### Community 38 - "expo-system-ui"
Cohesion: 0.17
Nodes (10): appJson, appJsonPath, fs, mobileShared, path, pkg, pkgPath, repoShared (+2 more)

### Community 39 - "expo-web-browser"
Cohesion: 0.22
Nodes (8): expo, install, exclude, license, main, name, private, version

### Community 40 - "lucide-react-native"
Cohesion: 0.15
Nodes (20): apiClient, AxiosRequestConfig, RetriableConfig, styles, SubtaskDraft, SubtaskEdit, TaskBreakdownModal(), TaskBreakdownModalProps (+12 more)

### Community 41 - "react"
Cohesion: 0.25
Nodes (7): description, engines, node, license, name, sideEffects, type

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
Cohesion: 0.19
Nodes (13): GUEST_SHARED_LIST_INTENTS, isGuestId(), ActivityRow, clientMetaFromRequest(), listActivityForOwner(), logListActivity(), LogListActivityInput, resolveActorLabels() (+5 more)

### Community 46 - "react-native-screens"
Cohesion: 0.15
Nodes (8): canDeleteTaskDirectly(), isOwnTaskTree(), ListAccessDenialCode, ListPermissionInput, ListPermissionPresentation, ListPermissionTone, ShareMode, TaskCreatorInfo

### Community 47 - "react-native-svg"
Cohesion: 0.25
Nodes (8): cloudflare, categories, dash, docs_url, icon_urls, label, preview_image_url, products

### Community 48 - "@tanstack/query-async-storage-persister"
Cohesion: 0.15
Nodes (8): canDeleteTaskDirectly(), isOwnTaskTree(), ListAccessDenialCode, ListPermissionInput, ListPermissionPresentation, ListPermissionTone, ShareMode, TaskCreatorInfo

### Community 49 - "@tanstack/react-query"
Cohesion: 0.29
Nodes (6): 1. Semantic Versioning (SemVer) Format, 2. Breaking Change Checklist (Requires MAJOR Bump), Compile-Time / Code Level, Data & Architecture, Runtime / Behavioral, Software Versioning & Breaking Change Rules for Antigravity AI

### Community 50 - "@tanstack/react-query-persist-client"
Cohesion: 0.33
Nodes (5): b64url(), codes, PORT, s256(), server

### Community 51 - "Community 51"
Cohesion: 0.29
Nodes (7): devDependencies, @babel/core, eslint, eslint-config-expo, globals, @types/react, typescript

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
Cohesion: 0.29
Nodes (4): CHANGELOG_CATEGORY_ORDER, ChangelogCategory, ChangelogItem, ReleaseNote

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (3): fs, outPath, path

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (4): CHANGELOG_CATEGORY_ORDER, ChangelogCategory, ChangelogItem, ReleaseNote

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (14): useTaskSortPreferences(), CATEGORY_OPTIONS, ListsScreen(), ListsScreenProps, styles, current, emit(), getTaskSortPreferences() (+6 more)

### Community 64 - "Community 64"
Cohesion: 0.19
Nodes (14): verifyBearerToken(), isListFull(), listPendingDeletesForList(), listPendingDeletesForOwner(), pendingTaskDeleteIds(), removeSharedListAccess(), setUserTimeZone(), loader() (+6 more)

### Community 65 - "Community 65"
Cohesion: 0.09
Nodes (24): ChangelogModal(), ChangelogModalProps, styles, NotificationSoftAsk(), NotificationSoftAskProps, styles, OPTIONS, PhoneCarrierPickerModal() (+16 more)

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (17): deleteRequestActivitySummary(), trimActivitySummary(), approvePendingDelete(), declinePendingDelete(), deleteTasksById(), getPendingDeleteById(), loadTaskCreators(), mapRow() (+9 more)

### Community 70 - "Community 70"
Cohesion: 0.21
Nodes (17): guestIntentDenial(), guestWriteAllowed(), acceptSuggestedDisplayName(), dismissSuggestedDisplayName(), fetchProviderProfile(), providerProfileFields(), ProviderProfileInfo, sanitizeProviderAvatarUrl() (+9 more)

### Community 71 - "Community 71"
Cohesion: 0.06
Nodes (34): undici, ws, overrides, @babel/core, body-parser, browserslist, estree-util-value-to-estree, @humanfs/node (+26 more)

### Community 72 - "Community 72"
Cohesion: 0.17
Nodes (13): canEditReminderText(), Todo, TodoRow, UserSettings, taskTextError(), CalendarView(), CalendarViewProps, EditTaskModal() (+5 more)

### Community 73 - "Community 73"
Cohesion: 0.22
Nodes (12): allRingDrawables(), clampPercent(), fmt(), RING_THEMES, ringArcPath(), ringDrawableName(), ringTrackPath(), ringVectorXml() (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.25
Nodes (11): addCalendarInterval(), daysInMonth(), formatterCache, fromWallClock(), getFormatter(), getLocalTimeZone(), isValidTimeZone(), toWallClock() (+3 more)

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (11): addCalendarInterval(), daysInMonth(), formatterCache, fromWallClock(), getFormatter(), getLocalTimeZone(), isValidTimeZone(), toWallClock() (+3 more)

### Community 76 - "Community 76"
Cohesion: 0.17
Nodes (12): compareMain(), isTaskSortMode(), PRIORITY_RANK, priorityRank(), reminderTime(), resolveTaskSortMode(), SortableTask, sortTasks() (+4 more)

### Community 77 - "Community 77"
Cohesion: 0.18
Nodes (7): defaultPickerValue(), formatReminderPreview(), localDayIndex(), nextFullHour(), ReminderPreview, ReminderSelection, ResolveReminderInput

### Community 78 - "Community 78"
Cohesion: 0.18
Nodes (7): defaultPickerValue(), formatReminderPreview(), localDayIndex(), nextFullHour(), ReminderPreview, ReminderSelection, ResolveReminderInput

### Community 79 - "Community 79"
Cohesion: 0.17
Nodes (12): compareMain(), isTaskSortMode(), PRIORITY_RANK, priorityRank(), reminderTime(), resolveTaskSortMode(), SortableTask, sortTasks() (+4 more)

### Community 80 - "Community 80"
Cohesion: 0.27
Nodes (7): FloatingTabBar(), FloatingTabBarProps, styles, TabType, useAuth(), MainAppContent(), styles

### Community 81 - "Community 81"
Cohesion: 0.18
Nodes (11): startOfToday(), styles, TaskModal(), TaskModalProps, usePushPrompt(), styles, ToastContext, ToastContextType (+3 more)

### Community 82 - "Community 82"
Cohesion: 0.50
Nodes (4): findPhoneCarrier(), PHONE_CARRIERS, PhoneCarrier, phoneCarrierGatewayDomain()

### Community 83 - "Community 83"
Cohesion: 0.50
Nodes (4): findPhoneCarrier(), PHONE_CARRIERS, PhoneCarrier, phoneCarrierGatewayDomain()

### Community 84 - "Community 84"
Cohesion: 0.40
Nodes (4): Reporting a Vulnerability, Security Policy, Supported Versions, What to Include

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (3): { defineConfig }, expoConfig, globals

## Knowledge Gaps
- **531 isolated node(s):** `ListAccessDenial`, `ListScope`, `SerializeListOptions`, `AuthEnv`, `subjects` (+526 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `$id.tsx` to `Community 65`, `lucide-react-native`, `Community 80`, `Community 81`, `BottomTabNavigator.tsx`, `Community 61`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `verifyBearerToken()` connect `Community 64` to `Community 66`, `Community 70`, `auth.server.ts`, `Community 72`, `react-native-safe-area-context`, `.eslintrc.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `TodoManager` connect `auth.server.ts` to `Community 64`, `TodoManager`, `Community 66`, `Community 72`, `react-native-safe-area-context`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `ListAccessDenial`, `ListScope`, `SerializeListOptions` to the rest of the system?**
  _531 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `$id.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10887096774193548 - nodes in this community are weakly interconnected._
- **Should `TodoManager` be split into smaller, more focused modules?**
  _Cohesion score 0.05735430157261795 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._