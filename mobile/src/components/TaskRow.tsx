import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder } from "react-native";
import { Check, Clock, ListTree, Repeat, Bell, Plus, GripVertical } from "lucide-react-native";
import {
  PRIORITY_DROP_LABELS,
  resolvePriorityFromVerticalOffset,
  type PriorityLevel,
  type TodoItem,
} from "../shared";
import { useTheme } from "../context/ThemeContext";
import { typography, MIN_TOUCH_TARGET } from "../theme/theme";
import { formatReminderPillLabel, priorityColor } from "../utils/format";

export interface TaskRowProps {
  item: TodoItem;
  canEdit: boolean;
  isOwner: boolean;
  /** True while a complete/undo request for this task is in flight. */
  isPending: boolean;
  canDragPriority?: boolean;
  isDraggingPriority?: boolean;
  dragPreviewPriority?: PriorityLevel | null;
  onPriorityDragStart?: (item: TodoItem) => void;
  onPriorityDragHover?: (item: TodoItem, previewPriority: PriorityLevel) => void;
  onPriorityDragEnd?: (item: TodoItem, nextPriority: PriorityLevel) => void;
  onPriorityDragCancel?: () => void;
  onToggleCompleted: (item: TodoItem) => void;
  onEdit: (item: TodoItem) => void;
  onOpenSubtasks: (item: TodoItem) => void;
}

/** One top-level task card in a list: checkbox, text, badges, priority edge stripe, and '+' subtask action. */
export const TaskRow: React.FC<TaskRowProps> = ({
  item,
  canEdit,
  isPending,
  canDragPriority = false,
  isDraggingPriority = false,
  dragPreviewPriority = null,
  onPriorityDragStart,
  onPriorityDragHover,
  onPriorityDragEnd,
  onPriorityDragCancel,
  onToggleCompleted,
  onEdit,
  onOpenSubtasks,
}) => {
  const { theme } = useTheme();
  const [translateY] = useState(() => new Animated.Value(0));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canDragPriority,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          canDragPriority && Math.abs(gestureState.dy) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          onPriorityDragStart?.(item);
        },
        onPanResponderMove: (_evt, gestureState) => {
          const clampedDy = Math.max(-96, Math.min(96, gestureState.dy * 0.35));
          translateY.setValue(clampedDy);
          const preview = resolvePriorityFromVerticalOffset(item.priority, gestureState.dy);
          onPriorityDragHover?.(item, preview);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          const next = resolvePriorityFromVerticalOffset(item.priority, gestureState.dy);
          onPriorityDragEnd?.(item, next);
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          onPriorityDragCancel?.();
        },
      }),
    [
      canDragPriority,
      item,
      onPriorityDragCancel,
      onPriorityDragEnd,
      onPriorityDragHover,
      onPriorityDragStart,
      translateY,
    ]
  );

  const subtaskCount = item.subtasks?.length || 0;
  const completedSubtasks = item.subtasks?.filter((s) => s.completed).length || 0;
  const prio = (
    isDraggingPriority && dragPreviewPriority
      ? dragPreviewPriority
      : item.priority || "none"
  ) as PriorityLevel;
  const hasPriorityStripe = prio !== "none";

  return (
    <Animated.View
      style={{
        transform: [{ translateY }],
        zIndex: isDraggingPriority ? 10 : 0,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={isDraggingPriority}
        style={[
          styles.todoCard,
          {
            backgroundColor: theme.cardBg,
            borderColor: isDraggingPriority ? theme.accent : theme.cardBorder,
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

          {isDraggingPriority && dragPreviewPriority ? (
            <View
              style={[
                styles.pillBadge,
                {
                  backgroundColor:
                    dragPreviewPriority === "none"
                      ? theme.inputBg
                      : priorityColor(dragPreviewPriority, theme) + "22",
                },
              ]}
            >
              <Text
                style={[
                  styles.pillBadgeText,
                  {
                    color:
                      dragPreviewPriority === "none"
                        ? theme.textSecondary
                        : priorityColor(dragPreviewPriority, theme),
                  },
                ]}
              >
                Priority: {PRIORITY_DROP_LABELS[dragPreviewPriority]}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {canEdit && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onOpenSubtasks(item)}
          accessibilityRole="button"
          accessibilityLabel={`Add or manage subtasks for ${item.text}`}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Plus size={18} color={theme.textMuted} />
        </TouchableOpacity>
      )}

      {canDragPriority && (
        <View
          style={styles.actionBtn}
          {...panResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel={`Drag to change priority for ${item.text}`}
        >
          <GripVertical
            size={18}
            color={isDraggingPriority ? theme.accent : theme.textMuted}
          />
        </View>
      )}
    </TouchableOpacity>
    </Animated.View>
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
