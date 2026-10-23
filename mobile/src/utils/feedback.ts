import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export { getErrorMessage } from "../shared/mobile-ux";

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
