import React, { useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Clock, Check, Calendar as CalendarIcon, Plus } from "lucide-react-native";
import { apiClient } from "../api/client";
import { TodoItem } from "../../../shared";
import { useTheme } from "../context/ThemeContext";
import { TaskModal } from "../components/TaskModal";
import { syncTaskToNativeCalendar } from "../services/calendar";

// Helper to convert timestamp or Date to local YYYY-MM-DD string
const getLocalDateString = (dateInput: Date | number = new Date()) => {
  const d = typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const CalendarScreen: React.FC<{ listId: string }> = ({ listId }) => {
  const { theme, themeMode, hapticsEnabled } = useTheme();
  const queryClient = useQueryClient();
  const today = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [modalVisible, setModalVisible] = useState(false);

  const { data: todos } = useQuery({
    queryKey: ["todos", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!listId,
  });

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

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post(`/api/v1/todos/${id}/toggle`);
      return res.data.todo as TodoItem;
    },
    onSuccess: (updatedTodo) => {
      if (updatedTodo) {
        syncTaskToNativeCalendar(updatedTodo).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newTodo: any) => {
      const res = await apiClient.post("/api/v1/todos", { ...newTodo, listId });
      return res.data.todo as TodoItem;
    },
    onSuccess: (createdTodo) => {
      triggerSuccessHaptic();
      if (createdTodo) {
        syncTaskToNativeCalendar(createdTodo).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
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

  // Calculate default 9:00 AM timestamp for selected date
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
      <View style={styles.calendarCard}>
        <Calendar
          key={themeMode}
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
        <Text style={[styles.scheduleTitle, { color: theme.textPrimary }]}>
          Schedule for {selectedDate}
        </Text>
      </View>

      <FlatList
        data={selectedDateTodos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No tasks scheduled for this date.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
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
              style={[
                styles.checkbox,
                { borderColor: theme.accent },
                item.completed && { backgroundColor: theme.accent },
              ]}
              onPress={() => toggleMutation.mutate(item.id)}
            >
              {item.completed && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.todoText,
                  { color: theme.textPrimary },
                  item.completed && { textDecorationLine: "line-through", color: theme.textMuted },
                ]}
              >
                {item.text}
              </Text>
            </View>

            <View style={[styles.durationBadge, { backgroundColor: theme.accentLight }]}>
              <Clock size={11} color={theme.accent} />
              <Text style={[styles.durationText, { color: theme.accent }]}>
                {item.durationMinutes || 15}m
              </Text>
            </View>
          </View>
        )}
      />

      {/* FAB Add Task for Selected Date */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent }]}
        onPress={() => {
          triggerImpactHaptic();
          setModalVisible(true);
        }}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <TaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        initialReminderAt={getSelectedDate9AMTimestamp()}
        onSave={(newTodo) => {
          createMutation.mutate(newTodo);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  calendarCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
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
    fontSize: 16,
    fontWeight: "700",
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
  },
  todoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
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
    fontSize: 14,
    fontWeight: "500",
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
    fontSize: 11,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 90,
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
