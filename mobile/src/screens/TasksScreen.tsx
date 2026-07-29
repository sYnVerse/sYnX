import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Search, RefreshCw, Plus, Check, Trash2, Clock, ListTree, Repeat, Pencil } from "lucide-react-native";
import { apiClient } from "../api/client";
import { TodoItem } from "../../../shared";
import { TaskModal } from "../components/TaskModal";
import { TaskBreakdownModal } from "../components/TaskBreakdownModal";
import { TaskCardSkeleton } from "../components/SkeletonLoader";
import { useTheme } from "../context/ThemeContext";

export const TasksScreen: React.FC<{ listId: string }> = ({ listId }) => {
  const { theme, hapticsEnabled } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [selectedTaskForBreakdown, setSelectedTaskForBreakdown] = useState<TodoItem | null>(null);

  const { data: todos, refetch, isRefetching, isLoading } = useQuery({
    queryKey: ["todos", listId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/todos?listId=${listId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!listId,
  });

  const triggerSuccessHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/api/v1/todos/${id}/toggle`);
    },
    onSuccess: () => {
      triggerSuccessHaptic();
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/todos/${id}`);
    },
    onSuccess: () => {
      triggerImpactHaptic();
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newTodo: any) => {
      await apiClient.post("/api/v1/todos", { ...newTodo, listId });
    },
    onSuccess: () => {
      triggerSuccessHaptic();
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      await apiClient.put(`/api/v1/todos/${id}`, payload);
    },
    onSuccess: () => {
      triggerSuccessHaptic();
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    },
  });

  const handleDeleteTask = (task: TodoItem) => {
    triggerImpactHaptic();
    Alert.alert(
      "Delete Task",
      `Are you sure you want to delete "${task.text}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(task.id),
        },
      ]
    );
  };

  const handleSaveSubtasks = async (taskId: string, subtasks: any[]) => {
    try {
      await apiClient.patch(`/api/v1/todos/${taskId}`, { subtasks });
      queryClient.invalidateQueries({ queryKey: ["todos", listId] });
    } catch (e) {
      console.error("Failed to save subtasks", e);
    }
  };

  const filteredTodos = (todos || []).filter((t: TodoItem) =>
    t.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header & Search */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchInputWrapper,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
            },
          ]}
        >
          <Search size={18} color={theme.inputPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search tasks..."
            placeholderTextColor={theme.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          onPress={() => {
            triggerImpactHaptic();
            refetch();
          }}
        >
          <RefreshCw size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Task List */}
      {isLoading ? (
        <View style={{ paddingTop: 8 }}>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
          <TaskCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={filteredTodos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No tasks found</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                Tap the + button to add your first task to this list.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const subtaskCount = item.subtasks?.length || 0;
            const completedSubtasks = item.subtasks?.filter((s) => s.completed).length || 0;
            const duration = item.durationMinutes || 15;

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
                onPress={() => setSelectedTaskForBreakdown(item)}
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
                      item.completed && [styles.todoTextCompleted, { color: theme.textMuted }],
                    ]}
                  >
                    {item.text}
                  </Text>

                  <View style={styles.badgeRow}>
                    <View style={[styles.pillBadge, { backgroundColor: theme.accentLight }]}>
                      <Clock size={11} color={theme.accent} />
                      <Text style={[styles.pillBadgeText, { color: theme.accent }]}>{duration} min</Text>
                    </View>

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

                {/* Edit Task Action */}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setEditingTask(item)}
                >
                  <Pencil size={15} color={theme.textMuted} />
                </TouchableOpacity>

                {/* Delete Task Action with Confirmation */}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteTask(item)}
                >
                  <Trash2 size={16} color={theme.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Floating Add Task Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent }]}
        onPress={() => {
          triggerImpactHaptic();
          setEditingTask(null);
          setModalVisible(true);
        }}
      >
        <Plus size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create New Task Modal */}
      <TaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={(task) => createMutation.mutate(task)}
      />

      {/* Edit Existing Task Modal */}
      <TaskModal
        visible={!!editingTask}
        isEditing
        initialText={editingTask?.text}
        initialPriority={editingTask?.priority}
        initialRecurrence={editingTask?.recurrence}
        initialDurationMinutes={editingTask?.durationMinutes || 15}
        onClose={() => setEditingTask(null)}
        onSave={(updated) => {
          if (editingTask) {
            updateMutation.mutate({ id: editingTask.id, payload: updated });
          }
        }}
      />

      {/* Subtask Breakdown View */}
      <TaskBreakdownModal
        visible={!!selectedTaskForBreakdown}
        task={selectedTaskForBreakdown}
        onClose={() => setSelectedTaskForBreakdown(null)}
        onSaveSubtasks={handleSaveSubtasks}
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: "100%",
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 240,
  },
  todoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
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
    fontSize: 15,
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
    fontSize: 11,
    fontWeight: "600",
  },
  actionBtn: {
    padding: 6,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 95,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
});
