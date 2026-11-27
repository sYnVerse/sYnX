import {
  formatReminderPillLabel,
  getLocalTimeZone,
  initialReminderSelection,
  resolveReminderAt,
  type PriorityLevel,
  type RecurrencePattern,
  type ReminderSelection,
} from "../shared";
import { parseQuickAdd, type QuickAddMatchKind } from "../shared/quick-add";

export interface QuickAddChip {
  key: string;
  kind: QuickAddMatchKind;
  dismissToken: string;
  label: string;
}

export interface ComputeQuickAddFormInput {
  text: string;
  isEditing: boolean;
  smartEnabled?: boolean;
  now: number;
  baseDay?: string | null;
  timeZone?: string | null;
  dismissed: readonly string[];
  manualPriority: PriorityLevel | null;
  manualRecurrence: RecurrencePattern | null;
  manualDurationText: string | null;
  manualReminder: ReminderSelection | null;
  initialPriority: PriorityLevel;
  initialRecurrence: RecurrencePattern;
  initialDurationMinutes?: number | null;
  initialReminderAt?: number;
}

export interface QuickAddFormState {
  effectiveTitle: string;
  effectivePriority: PriorityLevel;
  effectiveRecurrence: RecurrencePattern;
  effectiveDurationText: string;
  effectiveReminderSelection: ReminderSelection;
  hasParsedReminder: boolean;
  reminderTouchedEffective: boolean;
  chips: QuickAddChip[];
  resolveEffectiveReminderAt: (at: number) => number | null | undefined;
}

const PRIORITY_CHIP_LABELS: Record<Exclude<PriorityLevel, "none">, string> = {
  high: "🔴 High",
  medium: "🟡 Medium",
  low: "🟢 Low",
};

const RECURRENCE_CHIP_LABELS: Record<Exclude<RecurrencePattern, "none">, string> = {
  daily: "🔁 Daily",
  weekly: "🔁 Weekly",
  monthly: "🔁 Monthly",
};

export function computeQuickAddFormState(input: ComputeQuickAddFormInput): QuickAddFormState {
  const {
    text,
    isEditing,
    smartEnabled = true,
    now,
    baseDay,
    timeZone,
    dismissed,
    manualPriority,
    manualRecurrence,
    manualDurationText,
    manualReminder,
    initialPriority,
    initialRecurrence,
    initialDurationMinutes,
    initialReminderAt,
  } = input;

  const baseDurationText = initialDurationMinutes != null ? String(initialDurationMinutes) : "";
  const baseReminderSelection = initialReminderSelection(initialReminderAt);

  const parsed = parseQuickAdd(text, {
    now,
    baseDay,
    timeZone: timeZone ?? getLocalTimeZone(),
    dismissed,
    features: { enabled: smartEnabled && !isEditing },
  });

  const effectivePriority = manualPriority ?? parsed.priority ?? initialPriority;
  const effectiveRecurrence = manualRecurrence ?? parsed.recurrence ?? initialRecurrence;
  const effectiveDurationText =
    manualDurationText !== null
      ? manualDurationText
      : parsed.durationMinutes != null
      ? String(parsed.durationMinutes)
      : baseDurationText;

  const hasParsedReminder = manualReminder === null && parsed.reminderAt !== null;
  const effectiveReminderSelection: ReminderSelection =
    manualReminder ??
    (parsed.reminderAt !== null ? { kind: "at", timestamp: parsed.reminderAt } : baseReminderSelection);
  const reminderTouchedEffective = manualReminder !== null || hasParsedReminder;

  const chips: QuickAddChip[] = [];
  for (const m of parsed.matches) {
    if (m.kind === "date") {
      if (manualReminder !== null || parsed.reminderAt === null) continue;
      chips.push({
        key: `date:${m.start}:${m.end}`,
        kind: "date",
        dismissToken: `date:${m.text}`,
        label: `📅 ${formatReminderPillLabel(parsed.reminderAt)}`,
      });
    } else if (m.kind === "recurrence") {
      if (manualRecurrence !== null || !parsed.recurrence || parsed.recurrence === "none") continue;
      chips.push({
        key: `recurrence:${m.start}:${m.end}`,
        kind: "recurrence",
        dismissToken: `recurrence:${m.text}`,
        label: RECURRENCE_CHIP_LABELS[parsed.recurrence],
      });
    } else if (m.kind === "priority") {
      if (manualPriority !== null || !parsed.priority || parsed.priority === "none") continue;
      chips.push({
        key: `priority:${m.start}:${m.end}`,
        kind: "priority",
        dismissToken: `priority:${m.text}`,
        label: PRIORITY_CHIP_LABELS[parsed.priority],
      });
    } else if (m.kind === "duration") {
      if (manualDurationText !== null || parsed.durationMinutes == null) continue;
      chips.push({
        key: `duration:${m.start}:${m.end}`,
        kind: "duration",
        dismissToken: `duration:${m.text}`,
        label: `⏱ ${parsed.durationMinutes}m`,
      });
    }
  }

  return {
    effectiveTitle: parsed.title,
    effectivePriority,
    effectiveRecurrence,
    effectiveDurationText,
    effectiveReminderSelection,
    hasParsedReminder,
    reminderTouchedEffective,
    chips,
    resolveEffectiveReminderAt: (at: number) =>
      reminderTouchedEffective
        ? resolveReminderAt({
            selection: effectiveReminderSelection,
            isEditing,
            existingReminderAt: initialReminderAt,
            now: at,
          })
        : initialReminderAt,
  };
}
