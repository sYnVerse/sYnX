# Software Versioning & Breaking Change Rules

Canonical versioning rules for this repo. Other agent instruction files should point here rather than duplicating policy.

## 1. Semantic Versioning (SemVer)

Format: **MAJOR.MINOR.PATCH**

| Bump | When |
|------|------|
| **MAJOR** | Breaking changes (see checklist below). Resets minor/patch to 0. |
| **MINOR** | Backward-compatible feature batch (new UX, settings flows, etc.). Resets patch to 0. |
| **PATCH** | Backward-compatible fixes only. |

Pre-releases use hyphens (`1.0.0-beta.1`); build metadata uses plus signs (`1.0.0+build12`).

## 2. Breaking Change Checklist (Requires MAJOR)

Any change that requires downstream users to update code to avoid compile or runtime failures:

### Compile-time / code level
- Deleting or renaming a public class, function, method, variable, or endpoint
- Changing argument types, return types, or removing arguments
- Adding required arguments without defaults
- Narrowing public exposure to private/protected/internal

### Runtime / behavioral
- Rejecting inputs that were previously accepted
- Throwing new unhandled exception types or changing error models
- Changing return shapes, keys, or formats
- Changing default execution logic of an existing routine

### Data & architecture
- Dropping JSON keys or mutating response field types
- `schema.sql` mutations: dropping columns, altering types, or adding non-null constraints without defaults
- Removing or renaming required environment variables or config keys

## 3. When to bump vs append (same calendar day)

- **Same day as the last release for that surface (web or mobile):** do **not** bump again. Append bullets under the existing same-day entry in the relevant changelog.
- **Different calendar day than the last release** (including a PR that will merge on a later day): bump to a **new** version and add a **new dated** What's New entry.
- **Changelog dates** are plain calendar dates in Pacific time (`America/Los_Angeles`) and use the day the release actually ships. Set or correct the date at release.
- Only increment when starting work on a new calendar day relative to the last release, or when the user explicitly requests a bump.

## 4. Mobile vs web (separate version lines)

| Surface | Single source of truth | Changelog |
|---------|------------------------|-----------|
| **Mobile** | `shared/mobile-version.ts` → `MOBILE_APP_VERSION` (e.g. `"3.2.0"`) | `mobile/src/constants/changelog.ts` |
| **Web** | `WEB_VERSION` in `app/constants/changelog.ts` | same file |

Bump **web** only for user-facing web changes. Bump **mobile** only for user-facing mobile changes. Do not keep them in lockstep.

### Mobile release steps

1. Set `MOBILE_APP_VERSION` in `shared/mobile-version.ts`.
2. Add or append What's New in `mobile/src/constants/changelog.ts` (imports `MOBILE_VERSION` via shared).
3. Sync mirrored files:
   ```bash
   cd mobile && npm run sync-version
   ```
   This runs `sync-shared` then updates `mobile/package.json` and `mobile/app.json` to match. The same sync also runs on `prestart` / `prebuild` / `eas-build-pre-install`.
4. `mobile/app.config.js` reads the shared version at build time and sets Expo `version` (Android `versionName` / iOS `CFBundleShortVersionString`). Do not rely on editing `app.json` alone.

**Do not** bump only `package.json` or only a changelog string — that is how Android can ship a stale store-visible version while What's New shows a newer one.

### Android `versionCode` / iOS `buildNumber`

These are developer-facing build numbers, managed by EAS remotely (`eas.json`: `cli.appVersionSource: "remote"` + `autoIncrement: true`). With remote app version source, `autoIncrement` must be boolean `true` (not a string) — EAS then increments Android `versionCode` / iOS `buildNumber` remotely. They are **not** the store-visible SemVer. Do **not** hand-edit them in the repo for normal releases.

There is no committed `android/` directory — do not run `npx expo prebuild --clean` just to bump versions.

Optional (outside the repo) if remote build numbers need a one-time sync with Play Console / TestFlight:

```bash
cd mobile
eas build:version:get -p android
eas build:version:set -p android   # only if re-initializing remote versionCode
```

## 5. Changelog item order

Within each version's `changes`, list items by category in this order:

1. **NEW**: new features
2. **IMPR**: improvements to existing features
3. **FIX**: bug fixes

Inside a category, keep the order the items were added. When appending to an existing entry, insert the new item at the end of its category group, not at the end of the list.

The order is defined once as `CHANGELOG_CATEGORY_ORDER` in `shared/changelog.ts` (synced to `mobile/src/shared/` by `sync-shared`). Both What's New views (web `app/routes/$id.tsx` and mobile `ChangelogModal.tsx`) render through `sortChangelogItems`, and `test/changelog-order.test.ts` fails if any entry in `app/constants/changelog.ts` or `mobile/src/constants/changelog.ts` is out of order. If a new category is ever added, add it to `ChangelogCategory` and place it in `CHANGELOG_CATEGORY_ORDER` in the same change.

## 6. Pre-finish checklist

Before marking mobile versioning work done:

- [ ] `shared/mobile-version.ts` has the intended `MOBILE_APP_VERSION`
- [ ] Ran `cd mobile && npm run sync-version` (`package.json` + `app.json` match)
- [ ] What's New entry exists / was appended in `mobile/src/constants/changelog.ts`
- [ ] Changelog items in each version are ordered NEW → IMPR → FIX (section 5)
- [ ] Web left unchanged unless there were user-facing web changes (`WEB_VERSION`)
- [ ] Tests pass (`npm test -- --run`; mobile typecheck if mobile code changed)
