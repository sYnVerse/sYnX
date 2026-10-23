import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { PriorityLevel, RecurrencePattern } from "../shared";
import { useTheme } from "../context/ThemeContext";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";
import { getErrorMessage } from "../utils/feedback";
import { useToast } from "../context/ToastContext";
import { usePushPrompt } from "../context/PushPromptContext";

interface TaskModalProps {
  visible: boolean;
  onClose: () => void;
  /** May return a Promise — sheet stays open until it resolves; closes only on success. */
  onSave: (task: {
    text: string;
    priority: PriorityLevel;
    reminderAt?: number;
    recurrence: RecurrencePattern;
    durationMinutes?: number | null;
  }) => void | Promise<void>;
  initialText?: string;
  initialPriority?: PriorityLevel;
  initialReminderAt?: number;
  initialRecurrence?: RecurrencePattern;
  initialDurationMinutes?: number | null;
  isEditing?: boolean;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  visible,
  onClose,
  onSave,
  initialText = "",
  initialPriority = "none",
  initialReminderAt,
  initialRecurrence = "none",
  initialDurationMinutes,
  isEditing = false,
}) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError } = useToast();
  const { maybeAskOnReminder } = usePushPrompt();
  const [text, setText] = useState(initialText);
  const [priority, setPriority] = useState<PriorityLevel>(initialPriority);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>(initialRecurrence);
  const [durationMinutes, setDurationMinutes] = useState<string>(
    initialDurationMinutes != null ? String(initialDurationMinutes) : ""
  );
  const [reminderMins, setReminderMins] = useState<number | null>(null);
  const [clearReminder, setClearReminder] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    setPriority(initialPriority);
    setRecurrence(initialRecurrence);
    setDurationMinutes(initialDurationMinutes != null ? String(initialDurationMinutes) : "");
    setReminderMins(null);
    setClearReminder(false);
    setSaving(false);
  }, [visible, initialText, initialPriority, initialRecurrence, initialDurationMinutes, initialReminderAt]);

  const triggerHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const triggerErrorHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const handleSave = async () => {
    if (!text.trim() || saving) return;
    triggerHaptic();
    const baseTimestamp = initialReminderAt || Date.now();
    let reminderAt: number | undefined | null = initialReminderAt;
    if (clearReminder) {
      reminderAt = isEditing ? null : undefined;
    } else if (reminderMins !== null) {
      reminderAt = baseTimestamp + reminderMins * 60 * 1000;
    }
    const cleanDur = durationMinutes.trim();
    const parsedDur = cleanDur ? parseInt(cleanDur.replace(/\D/g, ""), 10) : NaN;

    setSaving(true);
    try {
      await onSave({
        text: text.trim(),
        priority,
        reminderAt: reminderAt as any,
        recurrence,
        durationMinutes: isNaN(parsedDur) ? null : parsedDur,
      });
      onClose();
      // Contextual soft-ask when user first sets a reminder after declining
      if (reminderAt != null && reminderMins !== null && !clearReminder) {
        maybeAskOnReminder().catch(() => {});
      }
    } catch (e) {
      triggerErrorHaptic();
      showError(getErrorMessage(e, "Couldn't save task"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={saving ? undefined : onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
            {isEditing ? "Edit Task" : "New Task"}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: theme.textMuted }]}>Task Description</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                },
              ]}
              placeholder="What needs to be done?"
              placeholderTextColor={theme.inputPlaceholder}
              value={text}
              onChangeText={setText}
              autoFocus
              editable={!saving}
              accessibilityLabel="Task description"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>Est. Duration (Minutes)</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                },
              ]}
              keyboardType="number-pad"
              placeholder="Optional (e.g. 15)"
              placeholderTextColor={theme.inputPlaceholder}
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              editable={!saving}
              accessibilityLabel="Estimated duration in minutes"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>Priority Level</Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {(["none", "low", "medium", "high"] as PriorityLevel[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: priority === p }}
                  accessibilityLabel={`Priority ${p}`}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    priority === p && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setPriority(p);
                  }}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: theme.textSecondary },
                      priority === p && { color: "#FFFFFF", fontWeight: "700" },
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.textMuted }]}>Recurrence Pattern</Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {(["none", "daily", "weekly", "monthly"] as RecurrencePattern[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: recurrence === r }}
                  accessibilityLabel={`Recurrence ${r}`}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    recurrence === r && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setRecurrence(r);
                  }}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: theme.textSecondary },
                      recurrence === r && { color: "#FFFFFF", fontWeight: "700" },
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.textMuted }]}>Set Quick Reminder</Text>
            <View style={styles.row}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: clearReminder || (!reminderMins && !initialReminderAt) }}
                style={[
                  styles.pill,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  (clearReminder || (!reminderMins && !initialReminderAt)) && {
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                  },
                ]}
                onPress={() => {
                  triggerHaptic();
                  setReminderMins(null);
                  setClearReminder(true);
                }}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: theme.textSecondary },
                    (clearReminder || (!reminderMins && !initialReminderAt)) && {
                      color: "#FFFFFF",
                      fontWeight: "700",
                    },
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
              {[5, 15, 30, 60].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !clearReminder && reminderMins === mins }}
                  accessibilityLabel={`Reminder plus ${mins} minutes`}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    !clearReminder &&
                      reminderMins === mins && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setClearReminder(false);
                    setReminderMins(reminderMins === mins ? null : mins);
                  }}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: theme.textSecondary },
                      !clearReminder && reminderMins === mins && { color: "#FFFFFF", fontWeight: "700" },
                    ]}
                  >
                    +{mins}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: theme.accent, opacity: !text.trim() || saving ? 0.6 : 1 },
              ]}
              onPress={handleSave}
              disabled={!text.trim() || saving}
              accessibilityRole="button"
              accessibilityLabel={isEditing ? "Save task" : "Create task"}
              accessibilityState={{ disabled: !text.trim() || saving, busy: saving }}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveText}>Save Task</Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    maxHeight: "85%",
    borderWidth: 1,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: "700",
    marginTop: spacing.sm,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    padding: spacing.sm,
    borderRadius: 12,
    fontSize: typography.md,
    borderWidth: 1,
    marginBottom: 4,
    minHeight: MIN_TOUCH_TARGET,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    justifyContent: "center",
  },
  pillText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: spacing.lg,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelText: {
    fontWeight: "600",
  },
  saveButton: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
