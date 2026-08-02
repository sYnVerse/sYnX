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
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
              <View style={styles.headerLeft}>
                <View style={[styles.iconCircle, { backgroundColor: "rgba(34, 197, 94, 0.15)", borderColor: "rgba(34, 197, 94, 0.3)" }]}>
                  <Sparkles size={18} color="#4ADE80" />
                </View>
                <View>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: theme.textPrimary }]}>What's new?</Text>
                    <View style={styles.versionBadge}>
                      <Text style={styles.versionBadgeText}>{MOBILE_VERSION}</Text>
                    </View>
                  </View>
                  <Text style={[styles.subtitle, { color: theme.textMuted }]}>Latest features, fixes & improvements</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* List of Releases & Notes */}
            <ScrollView style={styles.scrollList} contentContainerStyle={{ paddingVertical: 12 }}>
              {MOBILE_CHANGELOG.map((release) => (
                <View key={release.version} style={styles.releaseSection}>
                  <View style={[styles.releaseHeader, { borderBottomColor: theme.inputBorder }]}>
                    <Text style={styles.releaseVersion}>{release.version}</Text>
                    {release.date && <Text style={[styles.releaseDate, { color: theme.textMuted }]}>{release.date}</Text>}
                  </View>
                  <View style={styles.itemsList}>
                    {release.changes.map((item, index) => {
                      const isNew = item.type === "NEW";
                      const isImpr = item.type === "IMPR";

                      const badgeBg = isNew
                        ? "rgba(34, 197, 94, 0.18)"
                        : isImpr
                        ? "rgba(56, 189, 248, 0.18)"
                        : "rgba(245, 158, 11, 0.18)";

                      const badgeText = isNew ? "#4ADE80" : isImpr ? "#38BDF8" : "#FBBF24";

                      const badgeBorder = isNew
                        ? "rgba(34, 197, 94, 0.3)"
                        : isImpr
                        ? "rgba(56, 189, 248, 0.3)"
                        : "rgba(245, 158, 11, 0.3)";

                      return (
                        <View key={index} style={styles.changeItemRow}>
                          <View style={[styles.tagBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
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

            {/* Dismiss Button */}
            <TouchableOpacity style={[styles.dismissBtn, { backgroundColor: theme.accent }]} onPress={onClose}>
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
    padding: 16,
  },
  safeContainer: {
    width: "100%",
    maxWidth: 440,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
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
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  versionBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  versionBadgeText: {
    color: "#4ADE80",
    fontSize: 11,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
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
    fontSize: 13,
    fontWeight: "800",
    color: "#4ADE80",
  },
  releaseDate: {
    fontSize: 10,
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
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  changeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  dismissBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  dismissBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
