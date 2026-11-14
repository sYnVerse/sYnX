import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { AlertTriangle, Download, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import {
  getUpdateState,
  subscribeUpdateState,
  dismissNativeUpdatePrompt,
  type UpdateState,
} from "../services/updates";
import { typography, spacing } from "../theme/theme";

interface NativeUpdateBannerProps {
  /** Optional override for update state (primarily for unit testing) */
  testUpdateState?: UpdateState;
}

export const NativeUpdateBanner: React.FC<NativeUpdateBannerProps> = ({ testUpdateState }) => {
  const { theme, hapticsEnabled } = useTheme();
  const [liveState, setLiveState] = React.useState<UpdateState>(getUpdateState());

  React.useEffect(() => {
    if (testUpdateState) return;
    return subscribeUpdateState(setLiveState);
  }, [testUpdateState]);

  const updateState = testUpdateState || liveState;
  const native = updateState.nativeUpdate;

  if (!native.isUpdateRequired) {
    return null;
  }

  // If dismissed and not blocking, hide the banner
  if (native.isDismissed && !native.isBlocking) {
    return null;
  }

  const handleOpenDownload = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const url = native.downloadUrl || "https://synx.christran.io/download/android";
    Linking.openURL(url).catch((err) => {
      console.warn("[updates] Could not open download URL:", err);
    });
  };

  const handleDismiss = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    dismissNativeUpdatePrompt().catch(() => {});
  };

  const warningColor = "#d97706";
  const warningBg = "rgba(217, 119, 6, 0.12)";
  const warningBorder = "rgba(217, 119, 6, 0.35)";

  if (native.isBlocking) {
    return (
      <View
        style={[
          styles.blockingContainer,
          { backgroundColor: theme.surface, borderColor: warningBorder },
        ]}
        accessibilityRole="alert"
        accessibilityLabel="Native update required"
      >
        <View style={[styles.blockingIconWrap, { backgroundColor: warningBg }]}>
          <AlertTriangle size={32} color={warningColor} />
        </View>
        <Text style={[styles.blockingTitle, { color: theme.textPrimary }]}>
          Native App Update Required
        </Text>
        <Text style={[styles.blockingMessage, { color: theme.textSecondary }]}>
          {native.message ||
            "A native app update is required. Over-The-Air updates are no longer supported on this build."}
        </Text>
        <TouchableOpacity
          style={[styles.blockingButton, { backgroundColor: warningColor }]}
          onPress={handleOpenDownload}
          accessibilityRole="button"
          accessibilityLabel="Install native update"
        >
          <Download size={18} color="#FFFFFF" />
          <Text style={styles.blockingButtonText}>Install Native Update</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: warningBg,
          borderColor: warningBorder,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Native update required"
    >
      <View style={styles.contentWrap}>
        <AlertTriangle size={18} color={warningColor} style={styles.icon} />
        <View style={styles.textWrap}>
          <Text style={[styles.bannerTitle, { color: warningColor }]}>
            Native Update Required
          </Text>
          <Text style={[styles.bannerMessage, { color: theme.textPrimary }]} numberOfLines={2}>
            {native.message ||
              "Over-The-Air updates no longer support this build. Install the new native release to stay up to date."}
          </Text>
        </View>
      </View>
      <View style={styles.actionsWrap}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: warningColor }]}
          onPress={handleOpenDownload}
          accessibilityRole="button"
          accessibilityLabel="Update now"
        >
          <Text style={styles.actionBtnText}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dismissBtn, { borderColor: warningBorder }]}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notification"
        >
          <X size={14} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  contentWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  icon: {
    marginTop: 2,
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: typography.sm,
    fontWeight: "700",
    marginBottom: 2,
  },
  bannerMessage: {
    fontSize: typography.xs,
    lineHeight: 16,
  },
  actionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: typography.xs,
    fontWeight: "700",
  },
  dismissBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  blockingContainer: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  blockingIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  blockingTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  blockingMessage: {
    fontSize: typography.sm,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  blockingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  blockingButtonText: {
    color: "#FFFFFF",
    fontSize: typography.sm,
    fontWeight: "700",
  },
});
