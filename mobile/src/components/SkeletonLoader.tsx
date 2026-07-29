import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

export const TaskCardSkeleton: React.FC = () => {
  const { theme, themeMode } = useTheme();
  const baseColor = themeMode === "light" ? "#E2E8F0" : "rgba(255, 255, 255, 0.05)";

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
      <View style={[styles.checkbox, { backgroundColor: baseColor }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.line, { width: "70%", backgroundColor: baseColor }]} />
        <View style={[styles.line, { width: "40%", backgroundColor: baseColor }]} />
      </View>
    </View>
  );
};

export const ListCardSkeleton: React.FC = () => {
  const { theme, themeMode } = useTheme();
  const baseColor = themeMode === "light" ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.06)";

  return (
    <View style={[styles.gridCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
      <View style={[styles.badgeLine, { backgroundColor: baseColor }]} />
      <View style={[styles.line, { width: "80%", height: 16, backgroundColor: baseColor }]} />
      <View style={[styles.line, { width: "60%", height: 12, backgroundColor: baseColor }]} />
      <View style={{ marginTop: 8, gap: 6 }}>
        <View style={[styles.line, { width: "90%", height: 10, backgroundColor: baseColor }]} />
        <View style={[styles.line, { width: "75%", height: 10, backgroundColor: baseColor }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  gridCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  line: {
    height: 14,
    borderRadius: 6,
  },
  badgeLine: {
    width: 60,
    height: 20,
    borderRadius: 10,
  },
});
