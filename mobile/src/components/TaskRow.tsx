import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Check, Trash2, Clock, ListTree, Repeat, Pencil, Bell, Flag } from "lucide-react-native";
import type { PriorityLevel, TodoItem } from "../shared";
import { useTheme } from "../context/ThemeContext";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";
import { formatReminderPillLabel, priorityColor, priorityLabel } from "../utils/format";

export interface TaskRowProps {
  item: TodoItem;
  canEdit: boolean;
  isOwner: boolean;
  /** True while a complete/undo request for this task is in flight. */
  isPending: boolean;
  onPress: (item: TodoItem) => void;
  onToggleCompleted: (item: TodoItem) => void;
  onEdit: (item: TodoItem) => void;
  onDelete: (item: TodoItem) => void;
}

/** One top-level task card in a list: checkbox, text, badges, and edit/delete actions. */
export const TaskRow: React.FC<TaskRowProps> = ({
  item,
  canEdit,
  isOwner,
  isPending,
  onPress,
  onToggleCompleted,
  onEdit,
  onDelete,
}) => {
  const { theme } = useTheme();
  const subtaskCount = item.subtasks?.length || 0;
  const completedSubtasks = item.subtasks?.filter((s) => s.completed).length || 0;
  const prio = (item.priority || "none") as PriorityLevel;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.todoCard,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.cardBorder,
          shadowColor: theme.shadowColor,
        },
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Task ${item.text}`}
    >
      <TouchableOpacity
        disabled={!canEdit || isPending}
        style={[
          styles.checkboxHit,
          (!canEdit || isPending) && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (!canEdit || isPending) return;
          onToggleCompleted(item);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: item.completed,
          disabled: !canEdit || isPending,
        }}
        accessibilityLabel={`Mark ${item.text} ${item.completed ? "incomplete" : "complete"}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.accent },
            item.completed && { backgroundColor: theme.accent },
          ]}
        >
          {item.completed && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
        </View>
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.todoText,
            { color: theme.textPrimary },
            item.completed && [styles.todoTextCompleted, { color: theme.textMuted }],
          ]}
          maxFontSizeMultiplier={1.45}
        >
          {item.text}
        </Text>

        <View style={styles.badgeRow}>
          {prio !== "none" && (
            <View
              style={[
                styles.pillBadge,
                { backgroundColor: priorityColor(prio, theme) + "22" },
              ]}
            >
              <Flag size={11} color={priorityColor(prio, theme)} />
              <Text style={[styles.pillBadgeText, { color: priorityColor(prio, theme) }]}>
                {priorityLabel(prio)}
              </Text>
            </View>
          )}

          {item.reminderAt ? (
            <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
              <Bell size={11} color={theme.accent} />
              <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                {formatReminderPillLabel(item.reminderAt)}
              </Text>
            </View>
          ) : null}

          {item.durationMinutes ? (
            <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
              <Clock size={11} color={theme.accent} />
              <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                {item.durationMinutes} min
              </Text>
            </View>
          ) : null}

          {item.pendingDelete ? (
            <View style={[styles.pillBadge, { backgroundColor: "rgba(245, 158, 11, 0.18)" }]}>
              <Text style={[styles.pillBadgeText, { color: "#F59E0B" }]}>
                Delete requested
              </Text>
            </View>
          ) : null}

          {item.recurrence !== "none" && (
            <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
              <Repeat size={11} color={theme.accent} />
              <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                {item.recurrence}
              </Text>
            </View>
          )}

          {subtaskCount > 0 && (
            <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
              <ListTree size={11} color={theme.accent} />
              <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                {completedSubtasks}/{subtaskCount} subtasks
              </Text>
            </View>
          )}
        </View>
      </View>

      {canEdit && (
        <>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onEdit(item)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.text}`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Pencil size={16} color={theme.textMuted} />
          </TouchableOpacity>

          {!item.pendingDelete && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onDelete(item)}
              accessibilityRole="button"
              accessibilityLabel={
                isOwner || item.canDeleteDirectly
                  ? `Delete ${item.text}`
                  : `Request delete for ${item.text}`
              }
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Trash2 size={16} color={theme.danger} />
            </TouchableOpacity>
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  todoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  checkboxHit: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  todoText: {
    fontSize: typography.md,
    fontWeight: "600",
  },
  todoTextCompleted: {
    textDecorationLine: "line-through",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  pillBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  actionBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
});
