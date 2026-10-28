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
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { CalendarClock } from "lucide-react-native";
import {
  PriorityLevel,
  RecurrencePattern,
  ReminderSelection,
  combineDateAndTime,
  defaultPickerValue,
  formatReminderPillLabel,
  formatReminderPreview,
  initialReminderSelection,
  nextFullHour,
  prefers24HourClock,
  resolveReminderAt,
} from "../shared";
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
  const [reminder, setReminder] = useState<ReminderSelection>(() =>
    initialReminderSelection(initialReminderAt)
  );
  /** True once the user changes the reminder row; untouched sheets save the reminder they opened with. */
  const [reminderTouched, setReminderTouched] = useState(false);
  /** Which native picker dialog is open: the date first, then the time. */
  const [pickerStep, setPickerStep] = useState<"date" | "time" | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date(nextFullHour()));
  /** Bumped to remount (re-open) the time dialog after a past time is rejected. */
  const [timePickerKey, setTimePickerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  /** Clock for the reminder preview; ticks on each minute boundary while the sheet is open. */
  const [now, setNow] = useState(() => Date.now());

  // Reset the form when the sheet opens or its initial values change. Done during
  // render (React's "adjust state when a prop changes" pattern) rather than in an
  // effect, so the sheet never paints a frame with the previous task's values.
  const openState = {
    visible,
    initialText,
    initialPriority,
    initialRecurrence,
    initialDurationMinutes,
    initialReminderAt,
  };
  const [prevOpenState, setPrevOpenState] = useState(openState);
  if (
    (Object.keys(openState) as (keyof typeof openState)[]).some(
      (k) => !Object.is(openState[k], prevOpenState[k])
    )
  ) {
    setPrevOpenState(openState);
    if (visible) {
      setText(initialText);
      setPriority(initialPriority);
      setRecurrence(initialRecurrence);
      setDurationMinutes(initialDurationMinutes != null ? String(initialDurationMinutes) : "");
      setReminder(initialReminderSelection(initialReminderAt));
      setReminderTouched(false);
      setPickerStep(null);
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      // Wake just after the next minute starts, so quick-pill previews ("+15m")
      // roll over at the same moment the saved value would.
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [visible]);

  /** The reminderAt that Save would send right now: the opened-with value until the row is touched. */
  const effectiveReminderAt = (at: number): number | null | undefined =>
    reminderTouched
      ? resolveReminderAt({ selection: reminder, isEditing, existingReminderAt: initialReminderAt, now: at })
      : initialReminderAt;

  const reminderPreview = formatReminderPreview(effectiveReminderAt(now), now);

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

  const chooseReminder = (next: ReminderSelection) => {
    setNow(Date.now());
    setReminderTouched(true);
    setReminder(next);
  };

  const openDateTimePicker = () => {
    if (saving) return;
    triggerHaptic();
    const current = resolveReminderAt({
      selection: reminder,
      isEditing,
      existingReminderAt: initialReminderAt,
    });
    setPickerDraft(new Date(defaultPickerValue(current)));
    setPickerStep("date");
  };

  const handlePickedDate = (picked: Date) => {
    // Keep the draft's time of day; if that is already past on the picked day
    // (e.g. today), start the time dialog on the next full hour instead.
    let draft = combineDateAndTime(picked, pickerDraft);
    if (draft <= Date.now()) {
      draft = combineDateAndTime(picked, nextFullHour());
    }
    setPickerDraft(new Date(draft));
    setPickerStep("time");
  };

  const handlePickedTime = (picked: Date) => {
    const timestamp = combineDateAndTime(pickerDraft, picked);
    if (timestamp <= Date.now()) {
      triggerErrorHaptic();
      showError("Pick a time in the future");
      setTimePickerKey((k) => k + 1);
      return;
    }
    triggerHaptic();
    chooseReminder({ kind: "at", timestamp });
    setPickerStep(null);
  };

  const handleSave = async () => {
    if (!text.trim() || saving) return;
    triggerHaptic();
    const reminderAt = effectiveReminderAt(Date.now());
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
      if (reminderAt != null && reminderTouched) {
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
                accessibilityState={{ selected: reminder.kind === "none" }}
                style={[
                  styles.pill,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  reminder.kind === "none" && {
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                  },
                ]}
                onPress={() => {
                  triggerHaptic();
                  chooseReminder({ kind: "none" });
                }}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: theme.textSecondary },
                    reminder.kind === "none" && {
                      color: "#FFFFFF",
                      fontWeight: "700",
                    },
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
              {[5, 15, 30, 60].map((mins) => {
                const selected = reminder.kind === "offset" && reminder.minutes === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={
                      isEditing ? `Push reminder back ${mins} minutes` : `Remind me in ${mins} minutes`
                    }
                    style={[
                      styles.pill,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                      selected && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      // Tapping the selected pill again goes back to what the sheet opened with.
                      chooseReminder(
                        selected ? initialReminderSelection(initialReminderAt) : { kind: "offset", minutes: mins }
                      );
                    }}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: theme.textSecondary },
                        selected && { color: "#FFFFFF", fontWeight: "700" },
                      ]}
                    >
                      +{mins}m
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: reminder.kind === "at", expanded: pickerStep !== null }}
                accessibilityLabel={
                  reminder.kind === "at"
                    ? `Reminder ${formatReminderPillLabel(reminder.timestamp)}. Change date and time`
                    : "Pick reminder date and time"
                }
                style={[
                  styles.pill,
                  styles.pillWithIcon,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  reminder.kind === "at" && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={openDateTimePicker}
                disabled={saving}
              >
                <CalendarClock size={14} color={reminder.kind === "at" ? "#FFFFFF" : theme.textSecondary} />
                <Text
                  style={[
                    styles.pillText,
                    { color: theme.textSecondary },
                    reminder.kind === "at" && { color: "#FFFFFF", fontWeight: "700" },
                  ]}
                  maxFontSizeMultiplier={1.3}
                >
                  {reminder.kind === "at" ? formatReminderPillLabel(reminder.timestamp) : "Pick date & time"}
                </Text>
              </TouchableOpacity>
            </View>
            {reminderPreview && (
              <Text
                style={[
                  styles.reminderPreview,
                  { color: reminderPreview.isPast ? theme.danger : theme.textMuted },
                ]}
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={1.3}
              >
                {reminderPreview.text}
              </Text>
            )}
            {/* Android opens these as native dialogs; each one shows when mounted. */}
            {pickerStep === "date" && (
              <DateTimePicker
                value={pickerDraft}
                mode="date"
                minimumDate={startOfToday()}
                accentColor={theme.accent}
                onValueChange={(_event, date) => handlePickedDate(date)}
                onDismiss={() => setPickerStep(null)}
              />
            )}
            {pickerStep === "time" && (
              <DateTimePicker
                key={timePickerKey}
                value={pickerDraft}
                mode="time"
                is24Hour={prefers24HourClock()}
                accentColor={theme.accent}
                onValueChange={(_event, date) => handlePickedTime(date)}
                onDismiss={() => setPickerStep(null)}
              />
            )}
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
  reminderPreview: {
    fontSize: typography.xs,
    marginTop: 8,
  },
  pillWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
