import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { TodoItem } from "../../../shared";
import { TaskModal } from "../components/TaskModal";

export const TasksScreen: React.FC<{ listId: string }> = ({ listId }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ["todos", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!listId,
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/api/v1/todos/${id}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/todos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newTodo: any) => {
      await apiClient.post("/api/v1/todos", { ...newTodo, listId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const filteredTodos = (data || []).filter((t: TodoItem) =>
    t.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
          <Text style={styles.refreshBtnText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredTodos}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#6366f1"
            colors={["#6366f1"]}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.todoCard}>
            <TouchableOpacity
              style={[styles.checkbox, item.completed && styles.checkboxChecked]}
              onPress={() => toggleMutation.mutate(item.id)}
            >
              {item.completed && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={[styles.todoText, item.completed && styles.todoTextCompleted]}>
                {item.text}
              </Text>
              {item.recurrence !== "none" && (
                <Text style={styles.badgeText}>🔄 {item.recurrence}</Text>
              )}
            </View>

            <TouchableOpacity onPress={() => deleteMutation.mutate(item.id)}>
              <Text style={styles.deleteBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <TaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={(task) => createMutation.mutate(task)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  refreshBtn: {
    backgroundColor: "#1e293b",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtnText: {
    fontSize: 16,
  },
  todoCard: {
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6366f1",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  todoText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "500",
  },
  todoTextCompleted: {
    textDecorationLine: "line-through",
    color: "#64748b",
  },
  badgeText: {
    color: "#818cf8",
    fontSize: 11,
    marginTop: 2,
  },
  deleteBtn: {
    color: "#f43f5e",
    fontSize: 16,
    paddingHorizontal: 8,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    backgroundColor: "#6366f1",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
  fabText: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 30,
  },
});
