import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Pin, Check, MoreHorizontal, Circle } from "lucide-react-native";
import type { TodoList, TodoItem } from "../shared";
import type { ListPreviewTasksResult } from "../shared/mobile-ux";
import type { ListsViewMode } from "../services/listViewPreferences";
import { useTheme } from "../context/ThemeContext";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";
import { formatListRowTitleAndEmoji, formatListRowMeta } from "../utils/format";

export interface ListRowProps {
  item: TodoList;
  isActive: boolean;
  isPinned: boolean;
  isShared: boolean;
  ownerName?: string;
  viewMode: ListsViewMode;
  pickingPinnedList: boolean;
  previewData?: ListPreviewTasksResult<TodoItem> | null;
  onPress: (item: TodoList) => void;
  onOpenActions: (item: TodoList) => void;
}

/**
 * Compact list row with 1-line title, leading category emoji (when categorized),
 * quiet status indicators (Pin, Check), 1-line meta text, a "⋯" action button,
 * and an optional task preview when in Details view (#143 & #131).
 */
export const ListRow: React.FC<ListRowProps> = ({
  item,
  isActive,
  isPinned,
  isShared,
  ownerName,
  viewMode,
  pickingPinnedList,
  previewData,
  onPress,
  onOpenActions,
}) => {
  const { theme } = useTheme();

  const { emoji, title } = formatListRowTitleAndEmoji({
    name: item.name,
    category: item.category,
  });

  const metaText = formatListRowMeta({
    openTaskCount: item.openTaskCount,
    category: item.category,
    shareMode: item.shareMode,
    isOwner: item.isOwner,
    ownerDisplayName: ownerName,
  });

  const showPreview = viewMode === "details" && isActive && !pickingPinnedList;

  const accessibilityLabel = pickingPinnedList
    ? `Show ${item.name} on the widget`
    : `List ${title}${isPinned ? ", Pinned" : ""}${isActive ? ", Active" : ""}. ${metaText}`;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.card,
        {
          backgroundColor: isActive ? theme.cardActiveBg : theme.cardBg,
          borderColor: isActive ? theme.accent : theme.cardBorder,
          borderWidth: isActive ? 1.5 : 1,
        },
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => {
        if (!pickingPinnedList) {
          onOpenActions(item);
        }
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: pickingPinnedList ? isPinned : isActive }}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={[
        { name: "activate", label: "Open list" },
        ...(!pickingPinnedList ? [{ name: "longpress", label: `Actions for ${item.name}` }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate") {
          onPress(item);
        } else if (event.nativeEvent.actionName === "longpress" && !pickingPinnedList) {
          onOpenActions(item);
        }
      }}
    >
      <View style={styles.rowMain}>
        {emoji ? (
          <View style={[styles.emojiContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
            <Text style={styles.emojiText}>{emoji}</Text>
          </View>
        ) : null}

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.titleText, { color: theme.textPrimary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1.35}
            >
              {title}
            </Text>

            {isPinned && (
              <View style={styles.statusBadge} accessibilityLabel="Pinned to widget">
                <Pin size={13} color={theme.accent} fill={theme.accent} />
              </View>
            )}

            {isActive && (
              <View style={styles.statusBadge} accessibilityLabel="Active list">
                <Check size={14} color={theme.accent} strokeWidth={2.5} />
              </View>
            )}
          </View>

          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.25}
          >
            {metaText}
          </Text>
        </View>

        {!pickingPinnedList && (
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => onOpenActions(item)}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${item.name}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreHorizontal size={20} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {showPreview && (
        <View style={[styles.previewSection, { borderTopColor: theme.cardBorder }]}>
          <Text style={[styles.previewSectionTitle, { color: theme.textMuted }]}>
            TASKS IN THIS LIST ({previewData?.openTasks.length ?? 0})
          </Text>

          {!previewData || previewData.totalMainCount === 0 ? (
            <Text style={[styles.previewMessage, { color: theme.textMuted }]}>
              No tasks in this list yet. Tap to add tasks!
            </Text>
          ) : previewData.openTasks.length === 0 ? (
            <Text style={[styles.previewMessage, { color: theme.textMuted }]}>
              All done! Every task in this list is completed.
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {previewData.openTasks.map(({ task, openSubtasks, completedSubtaskCount }) => (
                <View key={task.id} style={styles.taskGroup}>
                  <View style={styles.taskItemRow}>
                    <Circle size={15} color={theme.textMuted} />
                    <Text
                      style={[styles.taskItemText, { color: theme.textPrimary }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {task.text}
                    </Text>
                    {task.durationMinutes ? (
                      <Text style={[styles.durationBadge, { color: theme.textMuted }]}>
                        {task.durationMinutes}m
                      </Text>
                    ) : null}
                  </View>

                  {openSubtasks.map((st) => (
                    <View key={st.id} style={[styles.taskItemRow, styles.subtaskRow]}>
                      <Circle size={12} color={theme.textMuted} />
                      <Text
                        style={[styles.subtaskText, { color: theme.textSecondary }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {st.text}
                      </Text>
                      {st.durationMinutes ? (
                        <Text style={[styles.durationBadge, { color: theme.textMuted }]}>
                          {st.durationMinutes}m
                        </Text>
                      ) : null}
                    </View>
                  ))}

                  {completedSubtaskCount > 0 && (
                    <Text style={[styles.completedCountText, { color: theme.textMuted }]}>
                      {completedSubtaskCount} completed
                    </Text>
                  )}
                </View>
              ))}

              {previewData.completedMainCount > 0 && (
                <Text style={[styles.footerCompletedText, { color: theme.textMuted }]}>
                  {previewData.completedMainCount} completed
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: 8,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  emojiContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  emojiText: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleText: {
    fontSize: typography.md,
    fontWeight: "700",
    flexShrink: 1,
  },
  statusBadge: {
    justifyContent: "center",
    alignItems: "center",
  },
  metaText: {
    fontSize: typography.xs,
    marginTop: 2,
    fontWeight: "500",
  },
  moreBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },
  previewSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  previewSectionTitle: {
    fontSize: typography.xs - 1,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  previewMessage: {
    fontSize: typography.xs,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  taskGroup: {
    marginBottom: 4,
  },
  taskItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  taskItemText: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "500",
  },
  subtaskRow: {
    paddingLeft: 24,
    marginTop: 1,
  },
  subtaskText: {
    flex: 1,
    fontSize: typography.xs,
    fontWeight: "400",
  },
  durationBadge: {
    fontSize: typography.xs - 1,
    fontWeight: "600",
  },
  completedCountText: {
    paddingLeft: 24,
    fontSize: typography.xs - 1,
    fontStyle: "italic",
    marginTop: 1,
  },
  footerCompletedText: {
    fontSize: typography.xs - 1,
    fontStyle: "italic",
    marginTop: 4,
  },
});
