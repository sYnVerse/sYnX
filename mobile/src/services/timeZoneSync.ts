import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "../api/client";
import { describeTimeZone, getLocalTimeZone, isValidTimeZone } from "../shared";

/**
 * Home time zone: the zone repeating reminders keep their local clock time in.
 * It's filled in once from the phone when the account has none, and only
 * changes when the user picks "Switch" in the travel prompt or uses Settings.
 */

/** Device zone the user chose to keep their home zone for (don't ask again there). */
const KEPT_FOR_DEVICE_ZONE_KEY = "home_time_zone_kept_for_device_zone";

/** Home zone the server has for this user (undefined = not known yet). */
let knownHomeTimeZone: string | null | undefined;
let checking = false;
let promptOpen = false;
const listeners = new Set<(zone: string | null) => void>();

function setKnownHomeTimeZone(zone: string | null): void {
  knownHomeTimeZone = zone;
  listeners.forEach((fn) => fn(zone));
}

/** Current known home zone (undefined until settings have loaded). */
export function getKnownHomeTimeZone(): string | null | undefined {
  return knownHomeTimeZone;
}

/** Subscribe to home zone changes (Settings row). Returns an unsubscribe. */
export function subscribeHomeTimeZone(fn: (zone: string | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Save a new home zone on the server (explicit user choice). */
export async function setHomeTimeZone(zone: string): Promise<string | null> {
  if (!isValidTimeZone(zone)) return null;
  const res = await apiClient.put("/api/v1/settings/time-zone", { timeZone: zone });
  const stored = (res.data?.timeZone as string | undefined) ?? zone;
  setKnownHomeTimeZone(stored);
  await AsyncStorage.removeItem(KEPT_FOR_DEVICE_ZONE_KEY).catch(() => {});
  return stored;
}

/** Copy for the travel prompt (exported for tests and review). */
export function travelPromptCopy(deviceZone: string, homeZone: string) {
  const device = describeTimeZone(deviceZone);
  const home = describeTimeZone(homeZone);
  return {
    title: "Time zone changed",
    message:
      `You're now in ${device} (${deviceZone}). Your repeating reminders use ${home} (${homeZone}). ` +
      `Switch them to ${device}, or keep ${home}?`,
    switchLabel: `Switch to ${device}`,
    keepLabel: `Keep ${home}`,
  };
}

function showTravelPrompt(deviceZone: string, homeZone: string): void {
  if (promptOpen) return;
  promptOpen = true;
  const copy = travelPromptCopy(deviceZone, homeZone);
  Alert.alert(
    copy.title,
    copy.message,
    [
      {
        text: copy.keepLabel,
        style: "cancel",
        onPress: () => {
          promptOpen = false;
          AsyncStorage.setItem(KEPT_FOR_DEVICE_ZONE_KEY, deviceZone).catch(() => {});
        },
      },
      {
        text: copy.switchLabel,
        onPress: () => {
          promptOpen = false;
          setHomeTimeZone(deviceZone).catch(() => {
            Alert.alert("Couldn't update time zone", "Check your connection and try again from Settings.");
          });
        },
      },
    ],
    {
      cancelable: true,
      // Dismissing without choosing asks again next time.
      onDismiss: () => {
        promptOpen = false;
      },
    }
  );
}

/**
 * Run on sign-in, app start, and foreground. Pass the home zone from
 * GET /api/v1/settings when available (null = not set yet).
 * - No home zone yet: set it once from this phone.
 * - Phone is in the home zone: clear any "keep" answer.
 * - Phone is elsewhere and the user hasn't answered for this zone: ask.
 * Never throws.
 */
export async function checkHomeTimeZone(homeFromServer?: string | null): Promise<void> {
  if (homeFromServer !== undefined) setKnownHomeTimeZone(homeFromServer);
  const deviceZone = getLocalTimeZone();
  if (!deviceZone || knownHomeTimeZone === undefined || checking) return;
  checking = true;
  try {
    const home = knownHomeTimeZone;
    if (!home) {
      const res = await apiClient.put("/api/v1/settings/time-zone", {
        timeZone: deviceZone,
        onlyIfUnset: true,
      });
      setKnownHomeTimeZone((res.data?.timeZone as string | undefined) ?? deviceZone);
      return;
    }
    if (home === deviceZone) {
      await AsyncStorage.removeItem(KEPT_FOR_DEVICE_ZONE_KEY);
      return;
    }
    const keptFor = await AsyncStorage.getItem(KEPT_FOR_DEVICE_ZONE_KEY);
    if (keptFor === deviceZone) return;
    showTravelPrompt(deviceZone, home);
  } catch {
    // Older server or offline: checked again on the next start or foreground.
  } finally {
    checking = false;
  }
}

/** Forget the cached home zone (e.g. on sign-out). */
export function resetTimeZoneSync(): void {
  setKnownHomeTimeZone(null);
  knownHomeTimeZone = undefined;
  AsyncStorage.removeItem(KEPT_FOR_DEVICE_ZONE_KEY).catch(() => {});
}
