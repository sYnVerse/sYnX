import React from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { typography, MIN_TOUCH_TARGET } from "../theme/theme";

export interface CompletedSectionHeaderProps {
  /** How many completed items the section holds. */
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** "tasks" for a list, "subtasks" for a task's subtask list. Used in the screen reader label. */
  itemLabel?: "tasks" | "subtasks";
}

/** Tap target that shows or hides the collapsible "Completed" section. */
export const CompletedSectionHeader: React.FC<CompletedSectionHeaderProps> = ({
  count,
  expanded,
  onToggle,
  itemLabel = "tasks",
}) => {
  const { theme } = useTheme();
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <TouchableOpacity
      style={styles.header}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`Completed ${itemLabel}, ${count}`}
      accessibilityHint={expanded ? `Hides completed ${itemLabel}` : `Shows completed ${itemLabel}`}
      hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
    >
      <Chevron size={16} color={theme.textMuted} />
      <Text style={[styles.title, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
        Completed ({count})
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    marginBottom: 4,
  },
  title: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
});
