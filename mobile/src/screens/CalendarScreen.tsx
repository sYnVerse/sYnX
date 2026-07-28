import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { Calendar } from "react-native-calendars";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { TodoItem } from "../../../shared";

export const CalendarScreen: React.FC<{ listId: string }> = ({ listId }) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const { data: todos, refetch, isRefetching } = useQuery({
    queryKey: ["todos", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!listId,
  });

  const markedDates: Record<string, any> = {};
  (todos || []).forEach((t: TodoItem) => {
    if (t.reminderAt) {
      const dateStr = new Date(t.reminderAt).toISOString().split("T")[0];
      markedDates[dateStr] = {
        marked: true,
        dotColor: "#6366f1",
      };
    }
  });

  markedDates[selectedDate] = {
    ...(markedDates[selectedDate] || {}),
    selected: true,
    selectedColor: "#6366f1",
  };

  const tasksForSelectedDate = (todos || []).filter((t: TodoItem) => {
    if (!t.reminderAt) return false;
    const dateStr = new Date(t.reminderAt).toISOString().split("T")[0];
    return dateStr === selectedDate;
  });

  return (
    <View style={styles.container}>
      <Calendar
        theme={{
          backgroundColor: "#0f172a",
          calendarBackground: "#1e293b",
          textSectionTitleColor: "#94a3b8",
          selectedDayBackgroundColor: "#6366f1",
          selectedDayTextColor: "#ffffff",
          todayTextColor: "#818cf8",
          dayTextColor: "#f8fafc",
          textDisabledColor: "#475569",
          arrowColor: "#6366f1",
          monthTextColor: "#f8fafc",
        }}
        onDayPress={(day: any) => setSelectedDate(day.dateString)}
        markedDates={markedDates}
      />

      <View style={styles.daySection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Tasks for {selectedDate}</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
            <Text style={styles.refreshBtnText}>🔄</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={tasksForSelectedDate}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#6366f1"
              colors={["#6366f1"]}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tasks scheduled for this day.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.taskCard}>
              <Text style={styles.taskTitle}>{item.text}</Text>
              {item.recurrence !== "none" && (
                <Text style={styles.taskSub}>🔄 {item.recurrence}</Text>
              )}
            </View>
          )}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  daySection: {
    flex: 1,
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionHeader: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "bold",
  },
  refreshBtn: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtnText: {
    fontSize: 14,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    fontStyle: "italic",
  },
  taskCard: {
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  taskTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "500",
  },
  taskSub: {
    color: "#818cf8",
    fontSize: 12,
    marginTop: 2,
  },
});
