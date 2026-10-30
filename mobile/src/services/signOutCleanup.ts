import { secureSessionStore } from "../api/client";
import { releasePushTokenForSignOut } from "./notifications";
import { clearPersistedQueryCache } from "./storage";
import { clearWidgetPreferences } from "./widgetPreferences";
import { resetWidgetsLoggedOut } from "./widgetSync";

/**
 * Removes the signed-out user's data from this device. Used by both a manual
 * sign-out and a sign-out after the session can no longer be refreshed.
 */
export async function clearSignedOutDeviceData(): Promise<void> {
  // Stop pushes to this device for the signed-out user (best effort, never
  // waits on the network).
  await releasePushTokenForSignOut();
  await secureSessionStore.clearSessionTokens();
  await clearPersistedQueryCache();
  await clearWidgetPreferences();
  resetWidgetsLoggedOut();
}
