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
  ActivityIndicator,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { X, Plus, Minus, Clock, Check, Pencil } from "lucide-react-native";
import { TodoItem, sortTasks, splitCompletedTasks, type TaskSortMode } from "../shared";
import { apiClient } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../context/ToastContext";
import { typography, spacing, MIN_TOUCH_TARGET, getSheetBottomPadding } from "../theme/theme";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";
import { useSetTodoCompleted } from "../hooks/useSetTodoCompleted";
import { CompletedSectionHeader } from "./CompletedSectionHeader";
import { SubtaskEditModal } from "./SubtaskEditModal";

interface TaskBreakdownModalProps {
  visible: boolean;
  task: TodoItem | null;
  canEdit?: boolean;
  /** The list's sort, so subtasks are ordered the same way as the list. */
  sortMode: TaskSortMode;
  onClose: () => void;
}

export const TaskBreakdownModal: React.FC<TaskBreakdownModalProps> = ({
  visible,
  task,
  canEdit = true,
  sortMode,
  onClose,
}) => {
  const { theme, resolvedMode, hapticsEnabled } = useTheme();
  const { showError, showToast } = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [editingSubtask, setEditingSubtask] = useState<TodoItem | null>(null);

  // The Completed section starts collapsed each time the sheet opens; it isn't remembered.
  const [completedOpen, setCompletedOpen] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setCompletedOpen(false);
  }

  const { data: listTodos } = useQuery<TodoItem[]>({
    queryKey: ["todos", task?.listId],
    enabled: !!task?.listId,
  });

  const subtasks = useMemo(() => {
    if (!task) return [];
    if (listTodos) {
      return sortTasks(listTodos.filter((t) => t.parentId === task.id), sortMode);
    }
    return sortTasks(task.subtasks || [], sortMode);
  }, [task, listTodos, sortMode]);

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
    },
    onError: (e) => onErr(e, "Couldn't add subtask"),
  });

  const { setCompleted, isPendingId } = useSetTodoCompleted(task?.listId);

  const removeSubtaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/api/v1/todos/${id}`);
      return {
        pendingApproval: Boolean(res.data?.pendingApproval),
        message: res.data?.message as string | undefined,
      };
    },
    onSuccess: (result) => {
      triggerHaptic();
      if (result.pendingApproval) {
        showToast(
          result.message || "Delete request sent. The list owner must approve it.",
          "info"
        );
      }
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["todos", task.listId] });
        queryClient.invalidateQueries({ queryKey: ["delete-requests", task.listId] });
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

  const overallDurationMinutes = useMemo(() => {
    return subtasks.reduce((sum, st) => {
      const mins = st.durationMinutes;
      return sum + (typeof mins === "number" && !isNaN(mins) && mins > 0 ? mins : 0);
    }, 0);
  }, [subtasks]);

  const handleAddSubtask = () => {
    if (!newSubtaskText.trim() || !canEdit) return;
    addSubtaskMutation.mutate({
      text: newSubtaskText.trim(),
      durationMinutes: null,
    });
  };

  if (!task) return null;

  const completedCount = subtasks.filter((st) => st.completed).length;
  const progressPercent =
    subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;

  // Completed subtasks go in a collapsible section at the bottom, in the list's sort like the rest.
  const { active: activeDrafts, completed: completedDrafts } = splitCompletedTasks(subtasks);

  const renderSubtaskRow = (st: TodoItem) => (
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
        disabled={!canEdit || isPendingId(st.id)}
        style={[styles.checkboxHit, isPendingId(st.id) && { opacity: 0.7 }]}
        onPress={() => {
          if (!canEdit || isPendingId(st.id)) return;
          setCompleted({ id: st.id, completed: st.completed });
        }}
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: st.completed,
          disabled: !canEdit || isPendingId(st.id),
        }}
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

      <View style={styles.subtaskContent}>
        <Text
          style={[
            styles.subtaskText,
            { color: theme.textPrimary },
            st.completed && { color: theme.textMuted, textDecorationLine: "line-through" },
          ]}
          maxFontSizeMultiplier={1.4}
        >
          {st.text}
        </Text>
        {st.durationMinutes != null && st.durationMinutes > 0 ? (
          <View style={[styles.durationBadge, { backgroundColor: theme.accentLight }]}>
            <Clock size={10} color={theme.accent} />
            <Text style={[styles.durationBadgeText, { color: theme.accent }]}>
              {st.durationMinutes}m
            </Text>
          </View>
        ) : null}
      </View>

      {canEdit && (
        <View style={styles.subtaskActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              triggerHaptic();
              setEditingSubtask(st);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Edit subtask ${st.text}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Pencil size={15} color={theme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              triggerHaptic();
              removeSubtaskMutation.mutate(st.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Remove subtask ${st.text}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Minus size={15} color={theme.danger} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.cardBorder,
              paddingBottom: getSheetBottomPadding(insets.bottom, spacing.lg),
            },
          ]}
        >
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
            SUBTASKS ({completedCount}/{subtasks.length})
          </Text>

          <ScrollView
            style={styles.subtaskList}
            contentContainerStyle={{ paddingBottom: 8, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {subtasks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  No subtasks added yet. Break down this task below!
                </Text>
              </View>
            ) : (
              <>
                {activeDrafts.map(renderSubtaskRow)}
                {completedDrafts.length > 0 ? (
                  <CompletedSectionHeader
                    count={completedDrafts.length}
                    expanded={completedOpen}
                    itemLabel="subtasks"
                    onToggle={() => {
                      triggerHaptic();
                      setCompletedOpen((open) => !open);
                    }}
                  />
                ) : null}
                {completedOpen ? completedDrafts.map(renderSubtaskRow) : null}
              </>
            )}
          </ScrollView>

          {canEdit && (
            <View style={[styles.addInputRow, { borderColor: theme.inputBorder }]}>
              <TextInput
                style={[
                  styles.textInputFlex,
                  {
                    color: theme.textPrimary,
                    backgroundColor: theme.inputBg,
                    borderColor: theme.inputBorder,
                  },
                ]}
                placeholder="New subtask step..."
                placeholderTextColor={theme.inputPlaceholder}
                value={newSubtaskText}
                onChangeText={setNewSubtaskText}
                accessibilityLabel="New subtask text"
                onSubmitEditing={handleAddSubtask}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: addSubtaskMutation.isPending || !newSubtaskText.trim() ? 0.7 : 1,
                  },
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

      <SubtaskEditModal
        visible={!!editingSubtask}
        subtask={editingSubtask}
        onClose={() => setEditingSubtask(null)}
        onSave={async ({ id, text, durationMinutes }) => {
          await updateSubtaskMutation.mutateAsync({ id, text, durationMinutes });
        }}
      />
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
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
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
  subtaskContent: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  subtaskText: {
    fontSize: typography.sm,
    fontWeight: "500",
    lineHeight: 20,
  },
  durationBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  durationBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  subtaskActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionBtn: {
    width: MIN_TOUCH_TARGET - 8,
    height: MIN_TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: typography.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  addBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
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
