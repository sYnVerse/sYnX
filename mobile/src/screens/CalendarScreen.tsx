import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Clock, Check, Calendar as CalendarIcon, Plus, Bell, Flag } from "lucide-react-native";
import { apiClient } from "../api/client";
import { TodoItem, TodoList, type PriorityLevel } from "../shared";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { TaskModal } from "../components/TaskModal";
import { ListPermissionBanner } from "../components/ListPermissionBanner";
import { syncTaskToNativeCalendar } from "../services/calendar";
import { getCachedListName } from "../services/listNames";
import { typography, spacing, MIN_TOUCH_TARGET, getFabBottomOffset, getListBottomPadding } from "../theme/theme";
import { formatFriendlyDate, formatReminderTime, priorityColor, priorityLabel } from "../utils/format";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";
import { useSetTodoCompleted } from "../hooks/useSetTodoCompleted";

const getLocalDateString = (dateInput: Date | number = new Date()) => {
  const d = typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const CalendarScreen: React.FC<{ listId: string }> = ({ listId }) => {
  const { theme, resolvedMode, hapticsEnabled } = useTheme();
  const { showError } = useToast();
  const insets = useSafeAreaInsets();
  const fabBottom = getFabBottomOffset(insets.bottom);
  const queryClient = useQueryClient();
  const today = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [modalVisible, setModalVisible] = useState(false);

  const { data: listMeta } = useQuery({
    queryKey: ["list_meta", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/lists/${listId}`);
      return res.data.list as TodoList;
    },
    enabled: !!listId,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 2;
    },
  });

  const canEdit = listMeta?.canEdit === true;
  const isOwner = listMeta?.isOwner === true;
  const shareMode = listMeta?.shareMode ?? "private";
  const ownerDisplayName = listMeta?.owner?.displayName ?? null;

  const { data: todos, isRefetching, refetch, isError, error } = useQuery({
    queryKey: ["todos", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!listId && !!listMeta,
  });

  useEffect(() => {
    if (listId && listMeta) {
      refetch();
    }
  }, [listId, listMeta]);

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const triggerSuccessHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const onMutationError = (e: unknown, fallback: string) => {
    triggerErrorHaptic(hapticsEnabled);
    showError(getErrorMessage(e, fallback));
  };

  const { setCompleted, isPendingId } = useSetTodoCompleted(listId);

  const createMutation = useMutation({
    mutationFn: async (newTodo: any) => {
      const res = await apiClient.post("/api/v1/todos", { ...newTodo, listId });
      return res.data.todo as TodoItem;
    },
    onSuccess: (createdTodo) => {
      triggerSuccessHaptic();
      if (createdTodo) {
        queryClient.setQueryData<TodoItem[]>(["todos", listId], (old) =>
          old ? [...old, createdTodo] : [createdTodo]
        );
        syncTaskToNativeCalendar(createdTodo, {
          listName: getCachedListName(queryClient, createdTodo.listId),
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
    onError: (e) => onMutationError(e, "Couldn't create task"),
  });

  const markedDates: Record<string, any> = {};
  (todos || []).forEach((t) => {
    if (t.reminderAt) {
      const dateStr = getLocalDateString(t.reminderAt);
      markedDates[dateStr] = {
        marked: true,
        dotColor: theme.accent,
      };
    }
  });

  markedDates[selectedDate] = {
    ...markedDates[selectedDate],
    selected: true,
    selectedColor: theme.accent,
    selectedTextColor: "#FFFFFF",
  };

  const selectedDateTodos = (todos || []).filter((t) => {
    if (!t.reminderAt) return selectedDate === today;
    const d = getLocalDateString(t.reminderAt);
    return d === selectedDate;
  });

  const getSelectedDate9AMTimestamp = () => {
    const parts = selectedDate.split("-").map(Number);
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0, 0);
      return d.getTime();
    }
    return Date.now();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {listMeta ? (
        <ListPermissionBanner
          shareMode={shareMode}
          isOwner={isOwner}
          canEdit={canEdit}
          ownerDisplayName={ownerDisplayName}
        />
      ) : null}

      <View style={styles.calendarCard}>
        <Calendar
          key={resolvedMode}
          current={selectedDate}
          onDayPress={(day: DateData) => {
            triggerImpactHaptic();
            setSelectedDate(day.dateString);
          }}
          markedDates={markedDates}
          theme={{
            calendarBackground: theme.surface,
            textSectionTitleColor: theme.textMuted,
            selectedDayBackgroundColor: theme.accent,
            selectedDayTextColor: "#FFFFFF",
            todayTextColor: theme.accent,
            dayTextColor: theme.textPrimary,
            textDisabledColor: theme.textMuted + "50",
            dotColor: theme.accent,
            selectedDotColor: "#FFFFFF",
            arrowColor: theme.accent,
            monthTextColor: theme.textPrimary,
            indicatorColor: theme.accent,
            textDayFontWeight: "600",
            textMonthFontWeight: "700",
            textDayHeaderFontWeight: "600",
            textDayFontSize: 14,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 12,
          }}
          style={{
            borderRadius: 20,
            overflow: "hidden",
          }}
        />
      </View>

      <View style={styles.scheduleHeader}>
        <CalendarIcon size={16} color={theme.accent} />
        <Text style={[styles.scheduleTitle, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
          Schedule for {formatFriendlyDate(selectedDate)}
        </Text>
      </View>

      {isError && !todos ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {getErrorMessage(error, "Couldn't load schedule.")}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.accent }]}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={selectedDateTodos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: getListBottomPadding(insets.bottom) }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => { void refetch(); }}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No tasks scheduled for this date.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const prio = (item.priority || "none") as PriorityLevel;
            return (
              <View
                style={[
                  styles.todoCard,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: theme.cardBorder,
                    shadowColor: theme.shadowColor,
                  },
                ]}
              >
                <TouchableOpacity
                  disabled={!canEdit || isPendingId(item.id)}
                  style={[styles.checkboxHit, (!canEdit || isPendingId(item.id)) && { opacity: 0.7 }]}
                  onPress={() => {
                    if (!canEdit || isPendingId(item.id)) return;
                    setCompleted(item);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: item.completed,
                    disabled: !canEdit || isPendingId(item.id),
                  }}
                  accessibilityLabel={`Mark ${item.text} ${item.completed ? "incomplete" : "complete"}`}
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
                      item.completed && { textDecorationLine: "line-through", color: theme.textMuted },
                    ]}
                    maxFontSizeMultiplier={1.4}
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
                          {formatReminderTime(item.reminderAt)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {item.durationMinutes ? (
                  <View style={[styles.durationBadge, { backgroundColor: theme.accentLight }]}>
                    <Clock size={11} color={theme.accent} />
                    <Text style={[styles.durationText, { color: theme.accent }]}>
                      {item.durationMinutes}m
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {canEdit && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.accent, bottom: fabBottom }]}
          onPress={() => {
            triggerImpactHaptic();
            setModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add task for selected date"
        >
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <TaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        initialReminderAt={getSelectedDate9AMTimestamp()}
        onSave={async (newTodo) => {
          if (!canEdit) return;
          await createMutation.mutateAsync(newTodo);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  calendarCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: spacing.md,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  scheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  scheduleTitle: {
    fontSize: typography.md,
    fontWeight: "700",
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: "center",
  },
  emptyText: {
    fontSize: typography.sm,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  todoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  checkboxHit: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  todoText: {
    fontSize: typography.sm,
    fontWeight: "500",
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  pillBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  durationText: {
    fontSize: typography.xs,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: getFabBottomOffset(0),
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
