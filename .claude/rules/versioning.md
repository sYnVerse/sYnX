# Software Versioning & Breaking Change Rules

## 1. Semantic Versioning (SemVer) Format
Format: **MAJOR.MINOR.PATCH**
* **MAJOR**: Bumps for incompatible API changes (breaking changes). Resets Minor/Patch to 0. (e.g., `1.5.3` -> `2.0.0`)
* **MINOR**: Bumps for backward-compatible features. Resets Patch to 0. (e.g., `1.5.3` -> `1.6.0`)
* **PATCH**: Bumps for backward-compatible bug fixes. (e.g., `1.5.3` -> `1.5.4`)
* **Qualifiers**: Pre-releases use hyphens (`1.0.0-beta.1`); build metadata uses plus signs (`1.0.0+build12`).

## 2. Breaking Change Checklist (Requires MAJOR Bump)
A breaking change is any modification requiring downstream users to update their code to prevent compilation or runtime failures.

### Compile-Time / Code Level
* **Deletions**: Removing a public class, function, method, variable, or endpoint.
* **Renamings**: Changing the name or casing of any public identifier.
* **Signature Mutations**: Changing argument types, return types, or removing arguments.
* **Strict Parameters**: Adding required arguments to existing functions without default values.
* **Access Restrictions**: Changing public exposure to private, protected, or internal.

### Runtime / Behavioral
* **Input Tightening**: Rejecting data formats or inputs that were previously accepted.
* **Error Mutations**: Throwing new, unhandled exception types, or altering existing error models.
* **Output Structural Changes**: Changing return data shapes, keys, or formats (e.g., date formats).
* **Side-Effect Shifts**: Changing the default execution logic or outcome of an existing routine.

### Data & Architecture
* **API Payloads**: Dropping JSON keys or mutating their data types in responses.
* **Storage Schema**: Dropping DB columns, altering column types, or adding non-null constraints without defaults (`schema.sql`).
* **Configuration**: Removing or renaming required environment variables or configuration keys.

## 3. Same-Day Versioning Policy
- **Consolidate Same-Day Fixes**: Do NOT bump version numbers multiple times on the same calendar day for incremental bug fixes, follow-ups, or minor revisions (e.g. do not increment `v5.1.2` -> `v5.1.3` -> `v5.1.4` on the same day).
- **Same-Day Changelog Appending**: Append new changes as additional bullet points under the existing same-day release entry in `app/constants/changelog.ts` and `mobile/src/constants/changelog.ts`.
- **Version Incrementing**: Only increment SemVer version numbers when starting work on a new calendar day or when explicitly requested by the user.

## 4. Mobile app version (Expo / EAS) — single source of truth
User-facing SemVer (Android `versionName` / iOS `CFBundleShortVersionString` / in-app What's New) is defined **only** in:

* `shared/mobile-version.ts` → `MOBILE_APP_VERSION` (e.g. `"3.2.0"`)

Then:

1. Edit `MOBILE_APP_VERSION` in `shared/mobile-version.ts`.
2. Add / append What's New under `mobile/src/constants/changelog.ts` (imports `MOBILE_VERSION` via `version.ts` → shared).
3. Run `npm run sync-version` in `mobile/` (runs `sync-shared` then mirrors into `package.json` + `app.json`; also on `prestart` / `prebuild` / `eas-build-pre-install`).
4. `mobile/app.config.js` forces Expo/EAS `version` from that SSOT at build time (overrides any stale `app.json`).

**Do not** bump only `package.json` or only a changelog string — that is how Android stayed on `3.0.2` while What's New showed `v3.1.0`.

### Android `versionCode` / iOS `buildNumber`
These are **developer-facing** build numbers, managed by EAS **remotely** (`eas.json` → `cli.appVersionSource: "remote"` + `autoIncrement: "versionCode"`). They are not the store-visible SemVer. EAS increments them on each preview/production build; no repo edit required for normal releases.

Optional (Chris, outside the repo) if remote build numbers need a one-time sync with Play Console / TestFlight:

```bash
cd mobile
eas build:version:get -p android
eas build:version:set -p android   # only if re-initializing remote versionCode
```

There is **no** committed `android/` directory (`mobile/.gitignore`); do **not** run `npx expo prebuild --clean` for version bumps — managed EAS builds read `app.config.js` / `app.json` directly.
