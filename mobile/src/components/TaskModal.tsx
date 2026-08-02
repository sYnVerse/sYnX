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
} from "react-native";
import * as Haptics from "expo-haptics";
import { PriorityLevel, RecurrencePattern } from "../shared";
import { useTheme } from "../context/ThemeContext";

interface TaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (task: {
    text: string;
    priority: PriorityLevel;
    reminderAt?: number;
    recurrence: RecurrencePattern;
    durationMinutes?: number | null;
  }) => void;
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
  const [text, setText] = useState(initialText);
  const [priority, setPriority] = useState<PriorityLevel>(initialPriority);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>(initialRecurrence);
  const [durationMinutes, setDurationMinutes] = useState<string>(
    initialDurationMinutes != null ? String(initialDurationMinutes) : ""
  );
  const [reminderMins, setReminderMins] = useState<number | null>(null);
  const [clearReminder, setClearReminder] = useState<boolean>(false);

  useEffect(() => {
    setText(initialText);
    setPriority(initialPriority);
    setRecurrence(initialRecurrence);
    setDurationMinutes(initialDurationMinutes != null ? String(initialDurationMinutes) : "");
    setReminderMins(null);
    setClearReminder(false);
  }, [visible, initialText, initialPriority, initialRecurrence, initialDurationMinutes, initialReminderAt]);

  const triggerHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleSave = () => {
    if (!text.trim()) return;
    triggerHaptic();
    const baseTimestamp = initialReminderAt || Date.now();
    let reminderAt: number | undefined | null = initialReminderAt;
    if (clearReminder) {
      reminderAt = null;
    } else if (reminderMins !== null) {
      reminderAt = baseTimestamp + reminderMins * 60 * 1000;
    }
    const cleanDur = durationMinutes.trim();
    const parsedDur = cleanDur ? parseInt(cleanDur.replace(/\D/g, ""), 10) : NaN;
    onSave({
      text: text.trim(),
      priority,
      reminderAt: reminderAt as any,
      recurrence,
      durationMinutes: isNaN(parsedDur) ? null : parsedDur,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
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
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>Priority Level</Text>
            <View style={styles.row}>
              {(["none", "low", "medium", "high"] as PriorityLevel[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    priority === p && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setPriority(p);
                  }}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: theme.textSecondary },
                      priority === p && { color: "#FFFFFF", fontWeight: "700" },
                    ]}
                  >
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.textMuted }]}>Recurrence Pattern</Text>
            <View style={styles.row}>
              {(["none", "daily", "weekly", "monthly"] as RecurrencePattern[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    recurrence === r && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setRecurrence(r);
                  }}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: theme.textSecondary },
                      recurrence === r && { color: "#FFFFFF", fontWeight: "700" },
                    ]}
                  >
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.textMuted }]}>Set Quick Reminder</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.pill,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  (clearReminder || (!reminderMins && !initialReminderAt)) && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => {
                  triggerHaptic();
                  setReminderMins(null);
                  setClearReminder(true);
                }}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: theme.textSecondary },
                    (clearReminder || (!reminderMins && !initialReminderAt)) && { color: "#FFFFFF", fontWeight: "700" },
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
              {[5, 15, 30, 60].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    !clearReminder && reminderMins === mins && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setClearReminder(false);
                    setReminderMins(reminderMins === mins ? null : mins);
                  }}
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
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.accent }]}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>Save Task</Text>
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
    padding: 20,
    maxHeight: "85%",
    borderWidth: 1,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  cancelText: {
    fontWeight: "600",
  },
  saveButton: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  saveText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
