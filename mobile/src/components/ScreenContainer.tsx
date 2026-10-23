import React from "react";
import { View, StyleSheet, useWindowDimensions, ViewStyle, StyleProp } from "react-native";
import { spacing } from "../theme/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Max content width on tablets / wide screens */
  maxWidth?: number;
  /** Optional second column for wide layouts */
  side?: React.ReactNode;
}

/**
 * Centers content on wide screens and optionally shows a two-column layout.
 */
export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  style,
  maxWidth = 720,
  side,
}) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 900 && !!side;

  if (isWide) {
    return (
      <View style={[styles.wideRow, style]}>
        <View style={[styles.column, { maxWidth: Math.min(480, width * 0.45) }]}>{children}</View>
        <View style={[styles.sideColumn, { maxWidth: Math.min(420, width * 0.4) }]}>{side}</View>
      </View>
    );
  }

  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  inner: {
    flex: 1,
    width: "100%",
  },
  wideRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  column: {
    flex: 1,
  },
  sideColumn: {
    flex: 1,
    paddingTop: spacing.sm,
  },
});
