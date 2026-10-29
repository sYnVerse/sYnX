/**
 * Single source of truth for the sYnX mobile user-facing SemVer (no leading "v").
 * Synced into the mobile app via scripts/sync-shared.js → mobile/src/shared/.
 *
 * Also mirrored to package.json / app.json by mobile/scripts/sync-version.js,
 * and forced into Expo config by mobile/app.config.js (Android versionName).
 */
export const MOBILE_APP_VERSION = "3.4.0";

/** Display form used in What's New and Settings (leading "v"). */
export const MOBILE_VERSION = `v${MOBILE_APP_VERSION}` as const;
