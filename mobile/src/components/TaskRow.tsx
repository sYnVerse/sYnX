import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Check, Clock, ListTree, Repeat, Bell, Plus } from "lucide-react-native";
import type { PriorityLevel, TodoItem } from "../shared";
import { useTheme } from "../context/ThemeContext";
import { typography, MIN_TOUCH_TARGET } from "../theme/theme";
import { formatReminderPillLabel, priorityColor } from "../utils/format";

export interface TaskRowProps {
  item: TodoItem;
  canEdit: boolean;
  isOwner: boolean;
  /** True while a complete/undo request for this task is in flight. */
  isPending: boolean;
  /** True when an in-flight mutation on this task has exceeded the slow threshold. */
  isSlowPending?: boolean;
  onToggleCompleted: (item: TodoItem) => void;
  onEdit: (item: TodoItem) => void;
  onOpenSubtasks: (item: TodoItem) => void;
}

/** One top-level task card in a list: checkbox, text, badges, priority edge stripe, and '+' subtask action. */
export const TaskRow: React.FC<TaskRowProps> = ({
  item,
  canEdit,
  isPending,
  isSlowPending = false,
  onToggleCompleted,
  onEdit,
  onOpenSubtasks,
}) => {
  const { theme } = useTheme();
  const subtaskCount = item.subtasks?.length || 0;
  const completedSubtasks = item.subtasks?.filter((s) => s.completed).length || 0;
  const prio = (item.priority || "none") as PriorityLevel;
  const hasPriorityStripe = prio !== "none";

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.todoCard,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.cardBorder,
          shadowColor: theme.shadowColor,
          borderLeftWidth: hasPriorityStripe ? 4 : 1,
          borderLeftColor: hasPriorityStripe ? priorityColor(prio, theme) : theme.cardBorder,
        },
      ]}
      onPress={() => onEdit(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit task ${item.text}`}
    >
      <TouchableOpacity
        disabled={!canEdit}
        style={[
          styles.checkboxHit,
          (!canEdit || isPending) && { opacity: canEdit ? 0.85 : 0.7 },
        ]}
        onPress={() => {
          if (!canEdit) return;
          onToggleCompleted(item);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: item.completed,
          disabled: !canEdit,
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

      <View style={styles.cardContent}>
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
                {item.durationMinutes}m
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

          {isSlowPending ? (
            <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                Saving…
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
            <TouchableOpacity
              style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}
              onPress={() => onOpenSubtasks(item)}
              accessibilityRole="button"
              accessibilityLabel={`Manage ${completedSubtasks} of ${subtaskCount} subtasks for ${item.text}`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <ListTree size={11} color={theme.accent} />
              <Text style={[styles.pillBadgeText, { color: theme.accent }]}>
                {completedSubtasks}/{subtaskCount} subtasks
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {canEdit && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onOpenSubtasks(item)}
          accessibilityRole="button"
          accessibilityLabel={`Add or manage subtasks for ${item.text}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Plus size={18} color={theme.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  todoCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  checkboxHit: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: -2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
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
    marginTop: 4,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
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
