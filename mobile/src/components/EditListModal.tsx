import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiClient } from "../api/client";
import {
  TodoList,
  PRESET_CATEGORIES,
  TASK_SORT_OPTIONS,
  type CategoryOption,
  type TaskSortOverride,
} from "../shared";
import { buildCategorizedListName } from "../shared/mobile-ux";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useTaskSortPreferences } from "../hooks/useTaskSortPreferences";
import { setListTaskSortOverride } from "../services/taskSortPreferences";
import { typography, spacing, MIN_TOUCH_TARGET, getSheetBottomPadding } from "../theme/theme";
import { stripLeadingCategoryEmoji } from "../utils/format";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

export interface EditListModalProps {
  visible: boolean;
  list: TodoList | null;
  onClose: () => void;
  onSuccess?: (updatedList: TodoList) => void;
}

export const EditListModal: React.FC<EditListModalProps> = ({
  visible,
  list,
  onClose,
  onSuccess,
}) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError, showSuccess } = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const taskSortPrefs = useTaskSortPreferences();

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<CategoryOption | null>(null);
  const [editCustomCategoryText, setEditCustomCategoryText] = useState("");
  const [editSortOverride, setEditSortOverride] = useState<TaskSortOverride>("app_default");

  useEffect(() => {
    if (visible && list) {
      const matchingCat = list.category ? PRESET_CATEGORIES.find((c) => c.name === list.category) : null;
      const cat = matchingCat || (list.category ? PRESET_CATEGORIES.find((c) => c.name === "Custom") : null);
      setEditCategory(cat ?? null);
      setEditCustomCategoryText(matchingCat || !list.category ? "" : list.category);
      setEditName(stripLeadingCategoryEmoji(list.name, matchingCat?.emoji || ""));
      setEditSortOverride(taskSortPrefs.overrides[list.id] ?? "app_default");
    }
  }, [visible, list, taskSortPrefs.overrides]);

  const appSortLabel =
    TASK_SORT_OPTIONS.find((o) => o.value === taskSortPrefs.appDefault)?.label ?? "Reminder Time";
  const listSortOptions: { value: TaskSortOverride; label: string }[] = [
    { value: "app_default", label: `App default (${appSortLabel})` },
    ...TASK_SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const updateListMutation = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category?: string | null }) => {
      const res = await apiClient.put(`/api/v1/lists/${id}`, { name, category });
      return res.data?.list as TodoList | undefined;
    },
    onSuccess: (updatedList, variables) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => {
        if (!old) return [];
        return old.map((l) =>
          l.id === variables.id ? { ...l, name: variables.name, category: variables.category ?? null } : l
        );
      });
      queryClient.setQueryData<TodoList>(["list_meta", variables.id], (old) =>
        old ? { ...old, name: variables.name, category: variables.category ?? null } : updatedList
      );
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["list_meta", variables.id] });
      showSuccess("List updated");
      if (list) {
        onSuccess?.(updatedList ?? { ...list, name: variables.name, category: variables.category ?? null });
      }
      onClose();
    },
    onError: (e) => {
      triggerErrorHaptic(hapticsEnabled);
      showError(getErrorMessage(e, "Couldn't update list"));
    },
  });

  const handleUpdateList = () => {
    if (!list || !editName.trim() || updateListMutation.isPending) return;
    const categoryName = editCategory
      ? editCategory.name === "Custom"
        ? editCustomCategoryText.trim() || "Custom"
        : editCategory.name
      : null;
    const fullName = editCategory
      ? buildCategorizedListName(editCategory.emoji, editCategory.name, editName)
      : editName.trim();

    void setListTaskSortOverride(list.id, editSortOverride);
    updateListMutation.mutate({
      id: list.id,
      name: fullName,
      category: categoryName,
    });
  };

  if (!visible || !list) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: theme.surface,
              borderColor: theme.cardBorder,
              paddingBottom: getSheetBottomPadding(insets.bottom, spacing.lg),
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Edit List Details</Text>

          <Text style={[styles.label, { color: theme.textMuted }]}>Category Tag</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ selected: editCategory === null }}
              style={[
                styles.catBtn,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                editCategory === null && {
                  backgroundColor: theme.accentLight,
                  borderColor: theme.accent,
                  borderWidth: 2,
                },
              ]}
              onPress={() => setEditCategory(null)}
            >
              <Text style={styles.catEmoji}>🚫</Text>
              <Text
                style={[
                  styles.catName,
                  { color: theme.textPrimary },
                  editCategory === null && { color: theme.accent, fontWeight: "700" },
                ]}
              >
                None
              </Text>
            </TouchableOpacity>
            {PRESET_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.name}
                accessibilityRole="radio"
                accessibilityState={{ selected: editCategory?.name === cat.name }}
                style={[
                  styles.catBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  editCategory?.name === cat.name && {
                    backgroundColor: theme.accentLight,
                    borderColor: theme.accent,
                    borderWidth: 2,
                  },
                ]}
                onPress={() =>
                  setEditCategory((prev) => (prev?.name === cat.name ? null : cat))
                }
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text
                  style={[
                    styles.catName,
                    { color: theme.textPrimary },
                    editCategory?.name === cat.name && { color: theme.accent, fontWeight: "700" },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {editCategory?.name === "Custom" && (
            <View style={{ marginTop: 4 }}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Custom Category Name</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                ]}
                placeholder="e.g. Project X, Home Chores..."
                placeholderTextColor={theme.inputPlaceholder}
                value={editCustomCategoryText}
                onChangeText={setEditCustomCategoryText}
              />
            </View>
          )}

          <Text style={[styles.label, { color: theme.textMuted }]}>List Title</Text>
          <TextInput
            style={[
              styles.input,
              { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
            ]}
            value={editName}
            onChangeText={setEditName}
            autoFocus
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>Task Order</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Task order for this list"
          >
            {listSortOptions.map((opt) => {
              const selected = editSortOverride === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Task order: ${opt.label}`}
                  style={[
                    styles.catBtn,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    selected && {
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setEditSortOverride(opt.value)}
                >
                  <Text
                    style={[
                      styles.catName,
                      { color: theme.textPrimary },
                      selected && { color: theme.accent, fontWeight: "700" },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.createBtn,
                {
                  backgroundColor: theme.accent,
                  opacity: !editName.trim() || updateListMutation.isPending ? 0.5 : 1,
                },
              ]}
              onPress={handleUpdateList}
              disabled={!editName.trim() || updateListMutation.isPending}
            >
              {updateListMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.createBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  sheetDismiss: {
    flex: 1,
  },
  sheetContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    maxHeight: "88%",
    elevation: 10,
  },
  modalTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
    marginBottom: 14,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  catRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  catBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
    minHeight: MIN_TOUCH_TARGET - 4,
  },
  catEmoji: {
    fontSize: 16,
  },
  catName: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  input: {
    padding: 12,
    borderRadius: 12,
    fontSize: typography.sm,
    borderWidth: 1,
    marginBottom: 16,
    minHeight: MIN_TOUCH_TARGET,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontWeight: "600",
  },
  createBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
