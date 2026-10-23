import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function triggerImpactHaptic(enabled: boolean) {
  if (enabled && Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export function triggerSuccessHaptic(enabled: boolean) {
  if (enabled && Platform.OS !== "web") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

export function triggerErrorHaptic(enabled: boolean) {
  if (enabled && Platform.OS !== "web") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const err = error as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;
}
