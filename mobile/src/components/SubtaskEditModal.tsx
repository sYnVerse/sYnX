import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { typography, spacing, MIN_TOUCH_TARGET, getSheetBottomPadding } from "../theme/theme";
import { useToast } from "../context/ToastContext";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";
import { parseSubtaskDurationMinutes } from "../shared/mobile-ux";

export interface SubtaskEditModalProps {
  visible: boolean;
  subtask: {
    id: string;
    text: string;
    durationMinutes?: number | null;
  } | null;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    text: string;
    durationMinutes: number | null;
  }) => Promise<void> | void;
}

export const SubtaskEditModal: React.FC<SubtaskEditModalProps> = ({
  visible,
  subtask,
  onClose,
  onSave,
}) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError } = useToast();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(subtask?.text ?? "");
  const [durationText, setDurationText] = useState(
    subtask?.durationMinutes != null ? String(subtask.durationMinutes) : ""
  );
  const [saving, setSaving] = useState(false);

  const [prevSubtaskId, setPrevSubtaskId] = useState<string | null>(null);
  if (visible && subtask && subtask.id !== prevSubtaskId) {
    setPrevSubtaskId(subtask.id);
    setText(subtask.text);
    setDurationText(
      subtask.durationMinutes != null ? String(subtask.durationMinutes) : ""
    );
    setSaving(false);
  } else if (!visible && prevSubtaskId !== null) {
    setPrevSubtaskId(null);
  }

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!subtask || !trimmed || saving) return;

    triggerImpactHaptic();
    const parsedMinutes = parseSubtaskDurationMinutes(durationText);
    const durationMinutes = parsedMinutes === undefined ? null : parsedMinutes;

    setSaving(true);
    try {
      await onSave({
        id: subtask.id,
        text: trimmed,
        durationMinutes,
      });
      onClose();
    } catch (e) {
      triggerErrorHaptic(hapticsEnabled);
      showError(getErrorMessage(e, "Couldn't save subtask"));
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !subtask) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            if (!saving) onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss subtask editor"
        />
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
            <Text
              style={[styles.headerTitle, { color: theme.textPrimary }]}
              maxFontSizeMultiplier={1.3}
            >
              Edit Subtask
            </Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Close subtask editor"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Title</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                },
              ]}
              value={text}
              onChangeText={setText}
              placeholder="Subtask title"
              placeholderTextColor={theme.inputPlaceholder}
              multiline
              accessibilityLabel="Subtask title"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Duration (minutes, optional)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                },
              ]}
              value={durationText}
              onChangeText={(val) => setDurationText(val.replace(/[^\d]/g, ""))}
              placeholder="e.g. 15 (blank for none)"
              placeholderTextColor={theme.inputPlaceholder}
              keyboardType="number-pad"
              accessibilityLabel="Subtask duration in minutes"
            />
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              ]}
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel subtask edit"
            >
              <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor: theme.accent,
                  opacity: saving || !text.trim() ? 0.7 : 1,
                },
              ]}
              onPress={handleSave}
              disabled={saving || !text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save subtask"
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  backdrop: {
    flex: 1,
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
  },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typography.md,
    minHeight: 46,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: typography.md,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: typography.md,
    fontWeight: "700",
  },
});
