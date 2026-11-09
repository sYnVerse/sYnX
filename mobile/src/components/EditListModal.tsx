import React, { useState } from "react";
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

interface EditListContentProps {
  list: TodoList;
  onClose: () => void;
  onSuccess?: (updatedList: TodoList) => void;
}

const EditListContent: React.FC<EditListContentProps> = ({ list, onClose, onSuccess }) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError, showSuccess } = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const taskSortPrefs = useTaskSortPreferences();

  const matchingCat = list.category ? PRESET_CATEGORIES.find((c) => c.name === list.category) : null;
  const initialCategory = matchingCat || (list.category ? PRESET_CATEGORIES.find((c) => c.name === "Custom") : null);

  const [editName, setEditName] = useState(() =>
    stripLeadingCategoryEmoji(list.name, matchingCat?.emoji || "")
  );
  const [editCategory, setEditCategory] = useState<CategoryOption | null>(initialCategory ?? null);
  const [editCustomCategoryText, setEditCustomCategoryText] = useState(
    matchingCat || !list.category ? "" : list.category
  );
  const [editSortOverride, setEditSortOverride] = useState<TaskSortOverride>(
    () => taskSortPrefs.overrides[list.id] ?? "app_default"
  );

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
      onSuccess?.(updatedList ?? { ...list, name: variables.name, category: variables.category ?? null });
      onClose();
    },
    onError: (e) => {
      triggerErrorHaptic(hapticsEnabled);
      showError(getErrorMessage(e, "Couldn't update list"));
    },
  });

  const handleUpdateList = () => {
    if (!editName.trim() || updateListMutation.isPending) return;
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

  return (
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
                backgroundColor: theme.accent + "22",
                borderColor: theme.accent,
              },
            ]}
            onPress={() => {
              triggerImpactHaptic();
              setEditCategory(null);
            }}
          >
            <Text
              style={[
                styles.catName,
                { color: editCategory === null ? theme.accent : theme.textMuted },
              ]}
            >
              None
            </Text>
          </TouchableOpacity>
          {PRESET_CATEGORIES.map((cat) => {
            const isSel = editCategory?.name === cat.name;
            return (
              <TouchableOpacity
                key={cat.name}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                style={[
                  styles.catBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  isSel && {
                    backgroundColor: theme.accent + "22",
                    borderColor: theme.accent,
                  },
                ]}
                onPress={() => {
                  triggerImpactHaptic();
                  setEditCategory(cat);
                }}
              >
                {cat.emoji ? <Text style={styles.catEmoji}>{cat.emoji}</Text> : null}
                <Text
                  style={[
                    styles.catName,
                    { color: isSel ? theme.accent : theme.textSecondary },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {editCategory?.name === "Custom" && (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.textPrimary,
              },
            ]}
            placeholder="Category name (e.g., Finance, Gym)"
            placeholderTextColor={theme.textMuted}
            value={editCustomCategoryText}
            onChangeText={setEditCustomCategoryText}
            maxLength={30}
            returnKeyType="next"
          />
        )}

        <Text style={[styles.label, { color: theme.textMuted }]}>List Name</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.textPrimary,
            },
          ]}
          value={editName}
          onChangeText={setEditName}
          placeholder="List Name"
          placeholderTextColor={theme.textMuted}
          autoFocus
          onSubmitEditing={handleUpdateList}
          returnKeyType="done"
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Sort Tasks By (This List)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
          {listSortOptions.map((opt) => {
            const isSel = editSortOverride === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                style={[
                  styles.catBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  isSel && {
                    backgroundColor: theme.accent + "22",
                    borderColor: theme.accent,
                  },
                ]}
                onPress={() => {
                  triggerImpactHaptic();
                  setEditSortOverride(opt.value);
                }}
              >
                <Text
                  style={[
                    styles.catName,
                    { color: isSel ? theme.accent : theme.textSecondary },
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
              { backgroundColor: theme.accent },
              (!editName.trim() || updateListMutation.isPending) && { opacity: 0.5 },
            ]}
            onPress={handleUpdateList}
            disabled={!editName.trim() || updateListMutation.isPending}
          >
            {updateListMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.createBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export const EditListModal: React.FC<EditListModalProps> = ({
  visible,
  list,
  onClose,
  onSuccess,
}) => {
  if (!visible || !list) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <EditListContent key={list.id} list={list} onClose={onClose} onSuccess={onSuccess} />
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
