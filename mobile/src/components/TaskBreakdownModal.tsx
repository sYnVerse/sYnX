import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { X, Plus, Minus, Clock, Check } from "lucide-react-native";
import { TodoItem } from "../shared";
import { apiClient } from "../api/client";
import { useTheme } from "../context/ThemeContext";

interface SubtaskItemState {
  id: string;
  text: string;
  completed: boolean;
  durationMinutes: number;
}

interface TaskBreakdownModalProps {
  visible: boolean;
  task: TodoItem | null;
  canEdit?: boolean;
  onClose: () => void;
}

export const TaskBreakdownModal: React.FC<TaskBreakdownModalProps> = ({
  visible,
  task,
  canEdit = true,
  onClose,
}) => {
  const { theme, themeMode, hapticsEnabled } = useTheme();
  const queryClient = useQueryClient();
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [newSubtaskDuration, setNewSubtaskDuration] = useState("5");

  const subtasks = useMemo(() => {
    if (!task || !task.subtasks) return [];
    return task.subtasks.map((st) => ({
      id: st.id,
      text: st.text,
      completed: st.completed,
      durationMinutes: st.durationMinutes ?? 5,
    }));
  }, [task]);

  const triggerHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ text, durationMinutes }: { text: string; durationMinutes: number }) => {
      if (!task) return;
      await apiClient.post("/api/v1/todos", {
        text,
        listId: task.listId,
        parentId: task.id,
        durationMinutes,
      });
    },
    onSuccess: () => {
      triggerHaptic();
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["todos", task.listId] });
      }
      setNewSubtaskText("");
      setNewSubtaskDuration("5");
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/api/v1/todos/${id}/toggle`);
    },
    onSuccess: () => {
      triggerHaptic();
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["todos", task.listId] });
      }
    },
  });

  const removeSubtaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/todos/${id}`);
    },
    onSuccess: () => {
      triggerHaptic();
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["todos", task.listId] });
      }
    },
  });

  const updateSubtaskDurationMutation = useMutation({
    mutationFn: async ({ id, durationMinutes }: { id: string; durationMinutes: number }) => {
      await apiClient.put(`/api/v1/todos/${id}`, { durationMinutes });
    },
    onSuccess: () => {
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["todos", task.listId] });
      }
    },
  });

  const overallDurationMinutes = useMemo(() => {
    return subtasks.reduce((sum, st) => sum + (st.durationMinutes || 0), 0);
  }, [subtasks]);

  const handleAddSubtask = () => {
    if (!newSubtaskText.trim() || !canEdit) return;
    const mins = parseInt(newSubtaskDuration.replace(/\D/g, ""), 10) || 5;
    addSubtaskMutation.mutate({ text: newSubtaskText.trim(), durationMinutes: mins });
  };

  if (!task) return null;

  const completedCount = subtasks.filter((st) => st.completed).length;
  const progressPercent =
    subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskTitle, { color: theme.textPrimary }]}>{task.text}</Text>
              <View style={styles.durationRow}>
                <Clock size={14} color={theme.accent} />
                <Text style={[styles.durationText, { color: theme.textSecondary }]}>
                  overall duration: <Text style={styles.boldDuration}>{overallDurationMinutes} min.</Text>
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressTrack, { backgroundColor: theme.inputBg }]}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: theme.accent, width: `${progressPercent}%` },
              ]}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            SUBTASKS ({completedCount}/{subtasks.length})
          </Text>

          {/* Subtask list */}
          <ScrollView style={styles.subtaskList} keyboardShouldPersistTaps="handled">
            {subtasks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  No subtasks added yet. Break down this task below!
                </Text>
              </View>
            ) : (
              subtasks.map((st) => (
                <View
                  key={st.id}
                  style={[
                    styles.subtaskRow,
                    {
                      backgroundColor: themeMode === "light" ? "#F8FAFC" : "rgba(255,255,255,0.03)",
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[
                      styles.checkbox,
                      { borderColor: theme.accent },
                      st.completed && { backgroundColor: theme.accent },
                    ]}
                    onPress={() => toggleSubtaskMutation.mutate(st.id)}
                  >
                    {st.completed && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                  </TouchableOpacity>

                  <Text
                    style={[
                      styles.subtaskText,
                      { color: theme.textPrimary },
                      st.completed && [styles.completedText, { color: theme.textMuted }],
                    ]}
                  >
                    {st.text}
                  </Text>

                  <View style={styles.minsInputWrapper}>
                    <TextInput
                      editable={canEdit}
                      style={[styles.minsInput, { color: theme.textSecondary, backgroundColor: theme.inputBg }]}
                      keyboardType="number-pad"
                      value={String(st.durationMinutes)}
                      onChangeText={(val) => {
                        const parsed = parseInt(val.replace(/\D/g, ""), 10);
                        if (!isNaN(parsed) && canEdit) {
                          updateSubtaskDurationMutation.mutate({ id: st.id, durationMinutes: parsed });
                        }
                      }}
                    />
                    <Text style={[styles.minsLabel, { color: theme.textMuted }]}>min.</Text>
                  </View>

                  {canEdit && (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeSubtaskMutation.mutate(st.id)}
                    >
                      <Minus size={16} color={theme.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          {/* Inline Add Subtask Input */}
          {canEdit && (
            <View style={[styles.addInputRow, { borderColor: theme.inputBorder }]}>
              <TextInput
                style={[styles.textInputFlex, { color: theme.textPrimary, backgroundColor: theme.inputBg }]}
                placeholder="New subtask step..."
                placeholderTextColor={theme.inputPlaceholder}
                value={newSubtaskText}
                onChangeText={setNewSubtaskText}
              />
              <TextInput
                style={[styles.minsInputAdd, { color: theme.textPrimary, backgroundColor: theme.inputBg }]}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={theme.inputPlaceholder}
                value={newSubtaskDuration}
                onChangeText={setNewSubtaskDuration}
              />
              <Text style={[styles.minsLabel, { color: theme.textMuted }]}>m</Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: theme.accent }]}
                onPress={handleAddSubtask}
              >
                <Plus size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* Close Button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.accent }]}
            onPress={onClose}
          >
            <Text style={styles.saveBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "85%",
    borderWidth: 1,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  durationText: {
    fontSize: 13,
    fontWeight: "500",
  },
  boldDuration: {
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtaskList: {
    maxHeight: 240,
    marginBottom: 12,
  },
  emptyContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  subtaskText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  completedText: {
    textDecorationLine: "line-through",
  },
  minsInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  minsInput: {
    width: 36,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  minsLabel: {
    fontSize: 11,
  },
  removeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  addInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  textInputFlex: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  minsInputAdd: {
    width: 44,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    textAlign: "center",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
