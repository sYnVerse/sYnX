# Graph Report - to-do-list  (2026-11-06)

## Corpus Check
- 222 files · ~286,968 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1479 nodes · 2978 edges · 106 communities (93 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44eb14d7`
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
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Dependabot NPM Package Updates|Dependabot NPM Package Updates]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_BottomTabNavigator.tsx|BottomTabNavigator.tsx]]
- [[_COMMUNITY_expo|expo]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_mobilepackage.json|mobile/package.json]]
- [[_COMMUNITY_mobiletsconfig.json|mobile/tsconfig.json]]
- [[_COMMUNITY_metro.config.js|metro.config.js]]
- [[_COMMUNITY_Community 24|Community 24]]
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
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 113|Community 113]]

## God Nodes (most connected - your core abstractions)
1. `getCloudflareContext()` - 52 edges
2. `useTheme()` - 44 edges
3. `verifyBearerToken()` - 42 edges
4. `TodoManager` - 27 edges
5. `logListActivity()` - 24 edges
6. `deleteRequestActivitySummary()` - 20 edges
7. `action()` - 20 edges
8. `getListAccess()` - 19 edges
9. `requestOrPerformDelete()` - 19 edges
10. `Todo` - 19 edges

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

## Communities (106 total, 13 thin omitted)

### Community 0 - "$id.tsx"
Cohesion: 0.14
Nodes (13): getProfileLabel(), initialsFromName(), ProfileLabel, Confetti(), CONFETTI_COLORS, EmptyState(), ProgressRing(), Toast() (+5 more)

### Community 1 - "TodoManager"
Cohesion: 0.15
Nodes (15): Todo, EditTaskModal(), EditTaskModalProps, QuickAddTaskModal(), QuickAddTaskModalProps, ActivityLogModal(), ActivityLogModalProps, CalendarView() (+7 more)

### Community 2 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+13 more)

### Community 3 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, cf-typegen, check, deploy, deploy:preview, dev, lint (+6 more)

### Community 4 - "devDependencies"
Cohesion: 0.07
Nodes (27): devDependencies, autoprefixer, @cloudflare/vite-plugin, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, eslint, eslint-import-resolver-typescript, @eslint/js (+19 more)

### Community 5 - "server.ts"
Cohesion: 0.09
Nodes (30): getRefreshedCookies(), cloudflareContext, DueReminderRow, getDueReminderRecipients(), base64UrlEncode(), FCMMessagePayload, getGoogleOAuthToken(), isInvalidTokenResponse() (+22 more)

### Community 6 - "auth.server.ts"
Cohesion: 0.11
Nodes (41): buildAuthClearCookieHeaders(), buildCentralLogoutClearHeaders(), clearAuthRefreshCookie(), clearAuthSessionCookie(), clearPkceCookie(), getCookieAttributes(), getCookieDomain(), getPkceCookieAttributes() (+33 more)

### Community 7 - "dependencies"
Cohesion: 0.06
Nodes (30): CreateListInput, CreateListSchema, CreateTodoInput, CreateTodoSchema, DeleteTargetType, ListActivityAction, ListActivityActorType, ListActivityEntry (+22 more)

### Community 8 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, isbot, @openauthjs/openauth, react, react-dom, react-router, @react-router/cloudflare, valibot

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (33): handleUpdateSettings(), ListRow, getAuthSettings(), getOptionalUser(), redirect(), listActivityForOwner(), listPendingDeletesForList(), listPendingDeletesForOwner() (+25 more)

### Community 17 - "CLAUDE.md"
Cohesion: 0.07
Nodes (26): Checks (CI runs these), Database schema (D1 migrations), End-to-End Testing (Playwright), graphify, Mobile dependency check (expo-doctor), Versioning Rules (SemVer), Worker Previews (pull request previews), Change the schema (+18 more)

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

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (12): FloatingTabBar(), FloatingTabBarProps, styles, TabType, useAuth(), useTaskSortPreferences(), MainAppContent(), styles (+4 more)

### Community 25 - "decode-google-services.js"
Cohesion: 0.11
Nodes (12): buildListWidgetSnapshot(), BuildSnapshotOptions, buildUpNextWidgetSnapshot(), ListWidgetSnapshot, mergePendingOpsIntoSnapshot(), ProgressWidgetSnapshot, reconcileWidgetPendingOps(), sanitizeWidgetValue() (+4 more)

### Community 29 - "expo-auth-session"
Cohesion: 0.07
Nodes (18): CalendarSettingsStateInput, CalendarSettingsStateOutput, CalendarSoftAskPolicyInput, contrastRatio(), evaluateCalendarSoftAskPolicy(), evaluateSoftAskPolicy(), formatFriendlyDate(), formatRescheduledToast() (+10 more)

### Community 30 - "expo-blur"
Cohesion: 0.07
Nodes (18): CalendarSettingsStateInput, CalendarSettingsStateOutput, CalendarSoftAskPolicyInput, contrastRatio(), evaluateCalendarSoftAskPolicy(), evaluateSoftAskPolicy(), formatFriendlyDate(), formatRescheduledToast() (+10 more)

### Community 31 - "expo-constants"
Cohesion: 0.05
Nodes (62): REFRESH_TOKEN_KEY, secureSessionStore, sessionRefresh, setAuthFailureHandler(), TOKEN_KEY, AuthContext, AuthContextType, AuthProvider() (+54 more)

### Community 32 - "expo-haptics"
Cohesion: 0.11
Nodes (12): buildListWidgetSnapshot(), BuildSnapshotOptions, buildUpNextWidgetSnapshot(), ListWidgetSnapshot, mergePendingOpsIntoSnapshot(), ProgressWidgetSnapshot, reconcileWidgetPendingOps(), sanitizeWidgetValue() (+4 more)

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
Cohesion: 0.23
Nodes (11): GuestContext, CompletedSectionToggle(), CompletedSectionToggleProps, FloatingPopover(), DurationPicker(), PriorityPicker(), RecurrencePicker(), ReminderPicker() (+3 more)

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
Cohesion: 0.16
Nodes (24): getListAccess(), ListAccessDenial, ListScope, SerializeListOptions, serializeListRow(), verifyBearerToken(), CloudflarePlatformContext, getCloudflareContext() (+16 more)

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
Cohesion: 0.11
Nodes (34): handleAcceptSuggestedDisplayName(), handleApproveDeleteRequest(), handleDeclineDeleteRequest(), handleDismissSuggestedDisplayName(), handleInitTimeZone(), handleListActivity(), handleMigrateGuestLists(), handleRemoveSharedList() (+26 more)

### Community 64 - "Community 64"
Cohesion: 0.17
Nodes (12): compareMain(), isTaskSortMode(), PRIORITY_RANK, priorityRank(), reminderTime(), resolveTaskSortMode(), SortableTask, sortTasks() (+4 more)

### Community 65 - "Community 65"
Cohesion: 0.10
Nodes (22): CalendarAccessSoftAsk(), CalendarAccessSoftAskProps, styles, NotificationSoftAsk(), NotificationSoftAskProps, styles, OPTIONS, PhoneCarrierPickerModal() (+14 more)

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (18): handleCreateTask(), handleSetCompleted(), handleToggleTask(), parseListScope(), serializeListRows(), GUEST_SHARED_LIST_INTENTS, guestWriteAllowed(), isListFull() (+10 more)

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (14): approvePendingDelete(), declinePendingDelete(), deleteTasksById(), getPendingDeleteById(), loadTaskCreators(), mapRow(), normalizeTargetId(), notifyOwnerOfDeleteRequest() (+6 more)

### Community 71 - "Community 71"
Cohesion: 0.08
Nodes (25): undici, ws, overrides, @babel/core, body-parser, browserslist, estree-util-value-to-estree, @humanfs/node (+17 more)

### Community 72 - "Community 72"
Cohesion: 0.23
Nodes (10): listeners, memory, notify(), readStoredValue(), useHydrated(), useStoredValue(), writeStoredValue(), useGuestLists() (+2 more)

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
Cohesion: 0.18
Nodes (11): startOfToday(), styles, TaskModal(), TaskModalProps, usePushPrompt(), styles, ToastContext, ToastContextType (+3 more)

### Community 80 - "Community 80"
Cohesion: 0.50
Nodes (4): getDisplayPhone(), SettingsData, useProfileSettings(), UseProfileSettingsOptions

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (7): isGuestId(), ActivityRow, clientMetaFromRequest(), LogListActivityInput, resolveActorLabels(), resolveActorType(), trimActivitySummary()

### Community 82 - "Community 82"
Cohesion: 0.11
Nodes (25): CompletedSectionHeader(), CompletedSectionHeaderProps, styles, copyFor(), ListAccessErrorKind, ListAccessErrorState(), ListAccessErrorStateProps, styles (+17 more)

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (6): FloatingPopoverProps, ComputePopoverOptions, computePopoverPosition(), PopoverPosition, RectLike, SizeLike

### Community 84 - "Community 84"
Cohesion: 0.40
Nodes (4): Reporting a Vulnerability, Security Policy, Supported Versions, What to Include

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (3): { defineConfig }, expoConfig, globals

### Community 88 - "Community 88"
Cohesion: 0.05
Nodes (74): PushPromptContext, PushPromptContextType, PushPromptProvider(), PushPromptProviderProps, applyCompletedTreatment(), buildCompletedEventNotes(), buildCompletedEventTitle(), buildTaskEventNotes() (+66 more)

### Community 89 - "Community 89"
Cohesion: 0.47
Nodes (5): checkListAccessGate(), getActiveListAccess(), ListAccessInfo, guestIntentDenial(), action()

### Community 90 - "Community 90"
Cohesion: 0.11
Nodes (21): CalendarPickerModal(), CalendarPickerModalProps, styles, ChangelogModal(), ChangelogModalProps, styles, MOBILE_CHANGELOG, COMPLETED_BEHAVIOR_OPTIONS (+13 more)

### Community 93 - "Community 93"
Cohesion: 0.50
Nodes (4): findPhoneCarrier(), PHONE_CARRIERS, PhoneCarrier, phoneCarrierGatewayDomain()

### Community 94 - "Community 94"
Cohesion: 0.50
Nodes (4): findPhoneCarrier(), PHONE_CARRIERS, PhoneCarrier, phoneCarrierGatewayDomain()

### Community 95 - "Community 95"
Cohesion: 0.28
Nodes (7): filterButtons, TASK_SORT_EMOJI, TaskToolbar(), TaskToolbarProps, Filter, useVisibleTodos(), UseVisibleTodosOptions

### Community 96 - "Community 96"
Cohesion: 0.14
Nodes (16): GuestActionPayload, CreateTaskForm(), CreateTaskFormProps, ListDialogs(), ListDialogsProps, ProfileAvatar(), ProfileModal(), ProfileModalProps (+8 more)

### Community 102 - "Community 102"
Cohesion: 0.29
Nodes (3): CATEGORY_EMOJIS, CategoryOption, PRESET_CATEGORIES

### Community 103 - "Community 103"
Cohesion: 0.29
Nodes (3): CATEGORY_EMOJIS, CategoryOption, PRESET_CATEGORIES

### Community 113 - "Community 113"
Cohesion: 0.53
Nodes (5): addTask(), createTestUser(), signInAs(), suppressWhatsNew(), TestUser

## Knowledge Gaps
- **563 isolated node(s):** `ListAccessDenial`, `ListScope`, `SerializeListOptions`, `AuthEnv`, `TestLoginResult` (+558 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Todo` connect `TodoManager` to `Community 96`, `expo-status-bar`, `Community 72`, `Community 13`, `Community 61`, `Community 95`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `getCloudflareContext()` connect `react-native-safe-area-context` to `Community 66`, `Community 70`, `auth.server.ts`, `Community 13`, `Community 89`, `Community 61`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `ListAccessDenial`, `ListScope`, `SerializeListOptions` to the rest of the system?**
  _563 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `$id.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14210526315789473 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._