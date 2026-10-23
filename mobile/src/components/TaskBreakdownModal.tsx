import React, { useState, useMemo, useEffect, useRef } from "react";
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
  ActivityIndicator,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { X, Plus, Minus, Clock, Check } from "lucide-react-native";
import { TodoItem } from "../shared";
import { apiClient } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

interface TaskBreakdownModalProps {
  visible: boolean;
  task: TodoItem | null;
  canEdit?: boolean;
  onClose: () => void;
}

/** Local draft state so minutes/text don't mutate on every keystroke. */
interface SubtaskDraft {
  id: string;
  text: string;
  completed: boolean;
  durationText: string;
}

export const TaskBreakdownModal: React.FC<TaskBreakdownModalProps> = ({
  visible,
  task,
  canEdit = true,
  onClose,
}) => {
  const { theme, resolvedMode, hapticsEnabled } = useTheme();
  const { showError } = useToast();
  const queryClient = useQueryClient();
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [newSubtaskDuration, setNewSubtaskDuration] = useState("5");
  const [drafts, setDrafts] = useState<Record<string, SubtaskDraft>>({});
  const durationTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: listTodos } = useQuery<TodoItem[]>({
    queryKey: ["todos", task?.listId],
    enabled: !!task?.listId,
  });

  const subtasks = useMemo(() => {
    if (!task) return [];
    if (listTodos) {
      return listTodos.filter((t) => t.parentId === task.id);
    }
    return task.subtasks || [];
  }, [task, listTodos]);

  // Sync server subtasks into local drafts without stomping in-progress edits.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, SubtaskDraft> = {};
      subtasks.forEach((st) => {
        const existing = prev[st.id];
        next[st.id] = {
          id: st.id,
          text: existing?.text ?? st.text,
          completed: st.completed,
          durationText:
            existing?.durationText ??
            (st.durationMinutes != null ? String(st.durationMinutes) : ""),
        };
      });
      return next;
    });
  }, [subtasks]);

  useEffect(() => {
    return () => {
      Object.values(durationTimers.current).forEach(clearTimeout);
    };
  }, []);

  const triggerHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const onErr = (e: unknown, fallback: string) => {
    triggerErrorHaptic(hapticsEnabled);
    showError(getErrorMessage(e, fallback));
  };

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ text, durationMinutes }: { text: string; durationMinutes: number | null }) => {
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
    onError: (e) => onErr(e, "Couldn't add subtask"),
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
    onError: (e) => onErr(e, "Couldn't update subtask"),
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
    onError: (e) => onErr(e, "Couldn't remove subtask"),
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({
      id,
      text,
      durationMinutes,
    }: {
      id: string;
      text?: string;
      durationMinutes?: number | null;
    }) => {
      const payload: Record<string, unknown> = {};
      if (text !== undefined) payload.text = text;
      if (durationMinutes !== undefined) payload.durationMinutes = durationMinutes;
      await apiClient.put(`/api/v1/todos/${id}`, payload);
    },
    onSuccess: () => {
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["todos", task.listId] });
      }
    },
    onError: (e) => onErr(e, "Couldn't save subtask"),
  });

  const saveDuration = (id: string, durationText: string) => {
    const cleaned = durationText.trim();
    if (!cleaned) {
      updateSubtaskMutation.mutate({ id, durationMinutes: null });
      return;
    }
    const parsed = parseInt(cleaned.replace(/\D/g, ""), 10);
    if (isNaN(parsed)) return;
    updateSubtaskMutation.mutate({ id, durationMinutes: parsed });
  };

  const scheduleDurationSave = (id: string, durationText: string) => {
    if (durationTimers.current[id]) clearTimeout(durationTimers.current[id]);
    durationTimers.current[id] = setTimeout(() => {
      saveDuration(id, durationText);
    }, 450);
  };

  const saveText = (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const server = subtasks.find((s) => s.id === id);
    if (server && server.text === trimmed) return;
    updateSubtaskMutation.mutate({ id, text: trimmed });
  };

  const overallDurationMinutes = useMemo(() => {
    return Object.values(drafts).reduce((sum, st) => {
      const n = parseInt(st.durationText.replace(/\D/g, ""), 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [drafts]);

  const handleAddSubtask = () => {
    if (!newSubtaskText.trim() || !canEdit) return;
    const cleaned = newSubtaskDuration.trim();
    const mins = cleaned ? parseInt(cleaned.replace(/\D/g, ""), 10) : NaN;
    addSubtaskMutation.mutate({
      text: newSubtaskText.trim(),
      durationMinutes: isNaN(mins) ? null : mins,
    });
  };

  if (!task) return null;

  const draftList = subtasks.map(
    (st) =>
      drafts[st.id] || {
        id: st.id,
        text: st.text,
        completed: st.completed,
        durationText: st.durationMinutes != null ? String(st.durationMinutes) : "",
      }
  );
  const completedCount = draftList.filter((st) => st.completed).length;
  const progressPercent =
    draftList.length > 0 ? Math.round((completedCount / draftList.length) * 100) : 0;

  // Note: drag-to-reorder skipped — TodoItem/API has no sort/position field without backend changes.

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskTitle, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
                {task.text}
              </Text>
              <View style={styles.durationRow}>
                <Clock size={14} color={theme.accent} />
                <Text style={[styles.durationText, { color: theme.textSecondary }]}>
                  overall duration: <Text style={styles.boldDuration}>{overallDurationMinutes} min.</Text>
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close breakdown"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: theme.inputBg }]}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: theme.accent, width: `${progressPercent}%` },
              ]}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            SUBTASKS ({completedCount}/{draftList.length})
          </Text>

          <ScrollView
            style={styles.subtaskList}
            contentContainerStyle={{ paddingBottom: 8, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {draftList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  No subtasks added yet. Break down this task below!
                </Text>
              </View>
            ) : (
              draftList.map((st) => (
                <View
                  key={st.id}
                  style={[
                    styles.subtaskRow,
                    {
                      backgroundColor:
                        resolvedMode === "light" ? "#F8FAFC" : "rgba(255,255,255,0.03)",
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={styles.checkboxHit}
                    onPress={() => toggleSubtaskMutation.mutate(st.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: st.completed, disabled: !canEdit }}
                    accessibilityLabel={`Mark subtask ${st.completed ? "incomplete" : "complete"}`}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        { borderColor: theme.accent },
                        st.completed && { backgroundColor: theme.accent },
                      ]}
                    >
                      {st.completed && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>

                  <TextInput
                    editable={canEdit}
                    style={[
                      styles.subtaskTextInput,
                      {
                        color: theme.textPrimary,
                        backgroundColor: "transparent",
                      },
                      st.completed && { color: theme.textMuted, textDecorationLine: "line-through" },
                    ]}
                    value={st.text}
                    onChangeText={(val) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [st.id]: { ...prev[st.id], text: val },
                      }))
                    }
                    onBlur={() => saveText(st.id, st.text)}
                    accessibilityLabel="Subtask text"
                  />

                  <View style={styles.minsInputWrapper}>
                    <TextInput
                      editable={canEdit}
                      style={[
                        styles.minsInput,
                        { color: theme.textSecondary, backgroundColor: theme.inputBg },
                      ]}
                      keyboardType="number-pad"
                      value={st.durationText}
                      placeholder="—"
                      placeholderTextColor={theme.inputPlaceholder}
                      onChangeText={(val) => {
                        const next = val.replace(/[^\d]/g, "");
                        setDrafts((prev) => ({
                          ...prev,
                          [st.id]: { ...prev[st.id], durationText: next },
                        }));
                        if (canEdit) scheduleDurationSave(st.id, next);
                      }}
                      onBlur={() => {
                        if (canEdit) saveDuration(st.id, st.durationText);
                      }}
                      accessibilityLabel="Subtask duration minutes"
                    />
                    <Text style={[styles.minsLabel, { color: theme.textMuted }]}>min.</Text>
                  </View>

                  {canEdit && (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeSubtaskMutation.mutate(st.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove subtask"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Minus size={16} color={theme.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          {canEdit && (
            <View style={[styles.addInputRow, { borderColor: theme.inputBorder }]}>
              <TextInput
                style={[styles.textInputFlex, { color: theme.textPrimary, backgroundColor: theme.inputBg }]}
                placeholder="New subtask step..."
                placeholderTextColor={theme.inputPlaceholder}
                value={newSubtaskText}
                onChangeText={setNewSubtaskText}
                accessibilityLabel="New subtask text"
              />
              <TextInput
                style={[styles.minsInputAdd, { color: theme.textPrimary, backgroundColor: theme.inputBg }]}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={theme.inputPlaceholder}
                value={newSubtaskDuration}
                onChangeText={setNewSubtaskDuration}
                accessibilityLabel="New subtask duration"
              />
              <Text style={[styles.minsLabel, { color: theme.textMuted }]}>m</Text>
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  { backgroundColor: theme.accent, opacity: addSubtaskMutation.isPending ? 0.7 : 1 },
                ]}
                onPress={handleAddSubtask}
                disabled={addSubtaskMutation.isPending || !newSubtaskText.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add subtask"
              >
                {addSubtaskMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Plus size={18} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.accent }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
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
    padding: spacing.lg,
    maxHeight: "90%",
    minHeight: "55%",
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
    fontSize: typography.xl,
    fontWeight: "700",
    marginBottom: 4,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  durationText: {
    fontSize: typography.sm,
    fontWeight: "500",
  },
  boldDuration: {
    fontWeight: "700",
  },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: typography.xs,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtaskList: {
    flexGrow: 1,
    flexShrink: 1,
    marginBottom: 12,
  },
  emptyContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: typography.sm,
    textAlign: "center",
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  checkboxHit: {
    width: MIN_TOUCH_TARGET - 8,
    height: MIN_TOUCH_TARGET - 8,
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
  subtaskTextInput: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "500",
    paddingVertical: 8,
    minHeight: MIN_TOUCH_TARGET - 8,
  },
  minsInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  minsInput: {
    width: 44,
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    textAlign: "center",
    fontSize: typography.xs,
    fontWeight: "600",
  },
  minsLabel: {
    fontSize: typography.xs,
  },
  removeBtn: {
    width: MIN_TOUCH_TARGET - 8,
    height: MIN_TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
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
    paddingVertical: 10,
    fontSize: typography.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  minsInputAdd: {
    width: 48,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: typography.sm,
    textAlign: "center",
    minHeight: MIN_TOUCH_TARGET,
  },
  addBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: typography.md,
    fontWeight: "700",
  },
});
