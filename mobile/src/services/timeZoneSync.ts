import { apiClient } from "../api/client";
import { getLocalTimeZone } from "../shared";

/** Zone the server is known to have for this user (undefined = not known yet). */
let knownServerTimeZone: string | null | undefined;
let inflight: Promise<void> | null = null;

/**
 * Report the device's IANA time zone to the server when it differs from the
 * stored one, so recurring tasks keep their local clock time across daylight
 * saving changes (and after travel). Pass the value from GET /api/v1/settings
 * when available; otherwise the last known value is used. Never throws.
 */
export function syncDeviceTimeZone(serverTimeZone?: string | null): Promise<void> {
  if (serverTimeZone !== undefined) knownServerTimeZone = serverTimeZone;
  const deviceZone = getLocalTimeZone();
  if (!deviceZone || deviceZone === knownServerTimeZone) return Promise.resolve();
  if (inflight) return inflight;

  inflight = apiClient
    .put("/api/v1/settings/time-zone", { timeZone: deviceZone })
    .then(() => {
      knownServerTimeZone = deviceZone;
    })
    .catch(() => {
      // Older server or offline: retried on the next start or foreground.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget the cached server value (e.g. on sign-out). */
export function resetTimeZoneSync(): void {
  knownServerTimeZone = undefined;
}
