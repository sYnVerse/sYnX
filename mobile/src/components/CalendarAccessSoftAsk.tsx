import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Calendar } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";

export interface CalendarAccessSoftAskProps {
  visible: boolean;
  onTurnOn: () => void;
  onTurnOffSync: () => void;
  onNotNow: () => void;
}

/**
 * Friendly prompt shown on launch and foreground when calendar sync is enabled in
 * sYnX but calendar access has been revoked or not granted.
 */
export const CalendarAccessSoftAsk: React.FC<CalendarAccessSoftAskProps> = ({
  visible,
  onTurnOn,
  onTurnOffSync,
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
            <Calendar size={28} color={theme.accent} />
          </View>
          <Text style={[styles.title, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
            Turn calendar access back on
          </Text>
          <Text style={[styles.body, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
            Calendar sync is turned on in sYnX, but calendar access isn&apos;t granted. Tasks won&apos;t sync to your calendar without access.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={() => {
              tap();
              onTurnOn();
            }}
            accessibilityRole="button"
            accessibilityLabel="Turn on calendar access"
          >
            <Text style={styles.primaryText}>Turn on</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
            ]}
            onPress={() => {
              tap();
              onTurnOffSync();
            }}
            accessibilityRole="button"
            accessibilityLabel="Turn off calendar sync"
          >
            <Text style={[styles.secondaryText, { color: theme.textPrimary }]}>
              Turn off calendar sync
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tertiaryBtn}
            onPress={() => {
              tap();
              onNotNow();
            }}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={[styles.tertiaryText, { color: theme.textMuted }]}>Not now</Text>
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginBottom: spacing.xs,
  },
  secondaryText: {
    fontWeight: "600",
    fontSize: typography.sm,
  },
  tertiaryBtn: {
    width: "100%",
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  tertiaryText: {
    fontWeight: "600",
    fontSize: typography.sm,
  },
});
