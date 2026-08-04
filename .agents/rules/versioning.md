# Software Versioning & Same-Day Fix Policy

## 1. Semantic Versioning (SemVer) Format
Format: **MAJOR.MINOR.PATCH**
* **MAJOR**: Bumps for incompatible API changes (breaking changes).
* **MINOR**: Bumps for backward-compatible features.
* **PATCH**: Bumps for backward-compatible bug fixes.

## 2. Same-Day Versioning Policy (CRITICAL)
- **Do NOT bump version numbers multiple times on the same calendar day**: For incremental bug fixes, follow-ups, or minor revisions on the same day, do NOT increment SemVer versions repeatedly (e.g. do not bump `v5.1.2` -> `v5.1.3` -> `v5.1.4` on the same day).
- **Consolidate Changelog Entries**: Append new changes as additional bullet points under the existing same-day release entry in `app/constants/changelog.ts` and `mobile/src/constants/changelog.ts`.
- **Version Incrementing**: Only increment SemVer version numbers when making changes on a new calendar day or when explicitly requested by the user.
