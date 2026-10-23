import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { X, Sparkles } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { MOBILE_VERSION, MOBILE_CHANGELOG } from "../constants/changelog";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";

interface ChangelogModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeContainer}>
          <View style={[styles.modalCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
              <View style={styles.headerLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: theme.badgeSuccessBg,
                      borderColor: theme.badgeSuccessBorder,
                    },
                  ]}
                >
                  <Sparkles size={18} color={theme.badgeSuccessFg} />
                </View>
                <View>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: theme.textPrimary }]}>What's new?</Text>
                    <View
                      style={[
                        styles.versionBadge,
                        {
                          backgroundColor: theme.badgeSuccessBg,
                          borderColor: theme.badgeSuccessBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.versionBadgeText, { color: theme.badgeSuccessFg }]}>
                        {MOBILE_VERSION}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                    Latest features, fixes & improvements
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollList} contentContainerStyle={{ paddingVertical: 12 }}>
              {MOBILE_CHANGELOG.map((release) => (
                <View key={release.version} style={styles.releaseSection}>
                  <View style={[styles.releaseHeader, { borderBottomColor: theme.inputBorder }]}>
                    <Text style={[styles.releaseVersion, { color: theme.badgeSuccessFg }]}>
                      {release.version}
                    </Text>
                    {release.date && (
                      <Text style={[styles.releaseDate, { color: theme.textMuted }]}>{release.date}</Text>
                    )}
                  </View>
                  <View style={styles.itemsList}>
                    {release.changes.map((item, index) => {
                      const isNew = item.type === "NEW";
                      const isImpr = item.type === "IMPR";

                      const badgeBg = isNew
                        ? theme.badgeSuccessBg
                        : isImpr
                        ? theme.accentLight
                        : "rgba(217, 119, 6, 0.15)";

                      const badgeText = isNew
                        ? theme.badgeSuccessFg
                        : isImpr
                        ? theme.accent
                        : "#B45309";

                      const badgeBorder = isNew
                        ? theme.badgeSuccessBorder
                        : isImpr
                        ? theme.accent + "55"
                        : "rgba(180, 83, 9, 0.35)";

                      return (
                        <View key={index} style={styles.changeItemRow}>
                          <View
                            style={[styles.tagBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}
                          >
                            <Text style={[styles.tagText, { color: badgeText }]}>{item.type}</Text>
                          </View>
                          <Text style={[styles.changeText, { color: theme.textPrimary }]}>{item.text}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.dismissBtn, { backgroundColor: theme.accent }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.dismissBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  safeContainer: {
    width: "100%",
    maxWidth: 440,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.lg,
    maxHeight: "82%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  title: {
    fontSize: typography.lg,
    fontWeight: "800",
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  versionBadgeText: {
    fontSize: typography.xs,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollList: {
    marginVertical: 4,
  },
  releaseSection: {
    marginBottom: 16,
  },
  releaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    paddingBottom: 4,
    marginBottom: 10,
  },
  releaseVersion: {
    fontSize: typography.sm,
    fontWeight: "800",
  },
  releaseDate: {
    fontSize: typography.xs,
  },
  itemsList: {
    gap: 10,
  },
  changeItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  tagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 1,
  },
  tagText: {
    fontSize: typography.xs,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  changeText: {
    flex: 1,
    fontSize: typography.sm,
    lineHeight: 18,
  },
  dismissBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  dismissBtnText: {
    color: "#FFFFFF",
    fontSize: typography.sm,
    fontWeight: "800",
  },
});
