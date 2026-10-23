import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Bell } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";

interface NotificationSoftAskProps {
  visible: boolean;
  onEnable: () => void;
  onNotNow: () => void;
}

/**
 * Friendly pre-permission prompt shown after sign-in (not over login / What's New).
 */
export const NotificationSoftAsk: React.FC<NotificationSoftAskProps> = ({
  visible,
  onEnable,
  onNotNow,
}) => {
  const { theme, hapticsEnabled } = useTheme();

  const tap = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onNotNow}>
      <View style={styles.overlay} accessibilityViewIsModal>
        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
          accessibilityRole="summary"
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.accentLight }]}>
            <Bell size={28} color={theme.accent} />
          </View>
          <Text style={[styles.title, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
            Stay on top of reminders
          </Text>
          <Text style={[styles.body, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
            sYnX can send push notifications when tasks are due so you never miss a reminder.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={() => {
              tap();
              onEnable();
            }}
            accessibilityRole="button"
            accessibilityLabel="Enable notifications"
          >
            <Text style={styles.primaryText}>Enable notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              tap();
              onNotNow();
            }}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={[styles.secondaryText, { color: theme.textMuted }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: typography.sm,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    width: "100%",
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginBottom: spacing.xs,
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.md,
  },
  secondaryBtn: {
    width: "100%",
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryText: {
    fontWeight: "600",
    fontSize: typography.sm,
  },
});
