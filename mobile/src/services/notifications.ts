import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { apiClient, DEVICE_PUSH_TOKEN_KEY } from "../api/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const SOFT_ASK_DECLINED_AT_KEY = "SYNX_PUSH_SOFT_ASK_DECLINED_AT";
const SOFT_ASK_REMINDER_NUDGED_KEY = "SYNX_PUSH_SOFT_ASK_REMINDER_NUDGED";
/** Re-offer soft ask at most once every 14 days after "Not now". */
export const SOFT_ASK_REASK_MS = 14 * 24 * 60 * 60 * 1000;

export type PushPermissionStatus =
  | "undetermined"
  | "granted"
  | "denied"
  | "blocked";

export async function ensureAndroidReminderChannel(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("task_reminders", {
      name: "Task Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
  }
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "undetermined") return "undetermined";
  // iOS/Android: denied and cannot ask again → treat as blocked (open Settings)
  if (!canAskAgain) return "blocked";
  return "denied";
}

/** Obtain device token and register with API. Assumes OS permission already granted. */
export async function registerPushTokenIfPermitted(): Promise<string | null> {
  await ensureAndroidReminderChannel();
  const status = await getPushPermissionStatus();
  if (status !== "granted") return null;

  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data;
    if (!token) return null;

    await apiClient.post("/api/v1/devices", {
      token,
      platform: Platform.OS,
    });
    await SecureStore.setItemAsync(DEVICE_PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.error("Failed to register push token", e);
    return null;
  }
}

/**
 * Request OS permission (after soft ask), then register token on grant.
 * Returns the token, or null if denied / failed.
 */
export async function requestAndRegisterPush(): Promise<string | null> {
  await ensureAndroidReminderChannel();

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (existing.status !== "granted") {
    if (existing.canAskAgain === false) {
      return null;
    }
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  return registerPushTokenIfPermitted();
}

/** @deprecated Prefer requestAndRegisterPush / registerPushTokenIfPermitted */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  return requestAndRegisterPush();
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const devicePushToken = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
    if (devicePushToken) {
      try {
        await apiClient.delete("/api/v1/devices", { data: { token: devicePushToken } });
      } catch {
        // ignore network errors when turning off
      }
      await SecureStore.deleteItemAsync(DEVICE_PUSH_TOKEN_KEY);
    }
  } catch (e) {
    console.error("Failed to unregister push token", e);
  }
}

export async function hasStoredPushToken(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
  return Boolean(token);
}

export async function markSoftAskDeclined(): Promise<void> {
  await AsyncStorage.setItem(SOFT_ASK_DECLINED_AT_KEY, String(Date.now()));
}

export async function clearSoftAskDeclined(): Promise<void> {
  await AsyncStorage.removeItem(SOFT_ASK_DECLINED_AT_KEY);
  await AsyncStorage.removeItem(SOFT_ASK_REMINDER_NUDGED_KEY);
}

export async function shouldShowSoftAsk(options?: {
  /** Contextual re-ask when user first sets a reminder after declining */
  contextualReminder?: boolean;
}): Promise<boolean> {
  const status = await getPushPermissionStatus();
  if (status === "granted" || status === "blocked") {
    return false;
  }
  // Only soft-ask when OS would still show a system dialog (undetermined),
  // or denied-but-canAskAgain on some Android versions.
  if (status === "denied") {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.canAskAgain === false) return false;
  }

  const declinedAtRaw = await AsyncStorage.getItem(SOFT_ASK_DECLINED_AT_KEY);
  if (!declinedAtRaw) return true;

  const declinedAt = Number(declinedAtRaw);
  if (Number.isNaN(declinedAt)) return true;

  const elapsed = Date.now() - declinedAt;
  if (elapsed >= SOFT_ASK_REASK_MS) return true;

  if (options?.contextualReminder) {
    const nudged = await AsyncStorage.getItem(SOFT_ASK_REMINDER_NUDGED_KEY);
    if (!nudged) return true;
  }

  return false;
}

export async function markContextualReminderNudgeShown(): Promise<void> {
  await AsyncStorage.setItem(SOFT_ASK_REMINDER_NUDGED_KEY, "1");
}

export async function openAppSystemSettings(): Promise<void> {
  await Linking.openSettings();
}

export async function scheduleLocalNotification(
  id: string,
  title: string,
  body: string,
  triggerTimestamp: number
) {
  if (triggerTimestamp <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title,
      body,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerTimestamp),
    },
  });
}

export async function cancelLocalNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}
