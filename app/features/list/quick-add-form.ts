import { parseQuickAdd, type QuickAddMatchKind } from "../../../shared/quick-add";
import {
  formatReminderPillLabel,
  getLocalTimeZone,
  type PriorityLevel,
  type RecurrencePattern,
} from "../../../shared";

export interface WebQuickAddChip {
  key: string;
  kind: QuickAddMatchKind;
  dismissToken: string;
  label: string;
}

export interface ComputeWebQuickAddInput {
  text: string;
  smartEnabled?: boolean;
  now: number;
  baseDay?: string | null;
  timeZone?: string | null;
  dismissed: readonly string[];
  manualPriority: PriorityLevel | null;
  /** `undefined` = untouched; `null` = explicitly cleared; number = explicitly chosen. */
  manualDuration: number | null | undefined;
  manualReminderActive: boolean;
  defaultPriority?: PriorityLevel;
  defaultDurationMinutes?: number | null;
  canSetReminders?: boolean;
}

export interface WebQuickAddState {
  effectiveTitle: string;
  effectivePriority: PriorityLevel;
  effectiveRecurrence: RecurrencePattern;
  effectiveDurationMinutes: number | null;
  parsedReminderAt: number | null;
  chips: WebQuickAddChip[];
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

/** Format a local Date into YYYY-MM-DD for calendar quick-add baseDay anchoring. */
export function formatLocalBaseDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Pure helper computing effective task fields and dismissible smart-parse chips
 * for the web add-task form and calendar quick-add modal.
 */
export function computeWebQuickAddState(input: ComputeWebQuickAddInput): WebQuickAddState {
  const {
    text,
    smartEnabled = true,
    now,
    baseDay,
    timeZone,
    dismissed,
    manualPriority,
    manualDuration,
    manualReminderActive,
    defaultPriority = "none",
    defaultDurationMinutes = null,
    canSetReminders = true,
  } = input;

  const parsed = parseQuickAdd(text, {
    now,
    baseDay,
    timeZone: timeZone ?? getLocalTimeZone(),
    dismissed,
    features: { enabled: smartEnabled },
  });

  const effectivePriority = manualPriority ?? parsed.priority ?? defaultPriority;
  const effectiveRecurrence = canSetReminders ? parsed.recurrence ?? "none" : "none";
  const effectiveDurationMinutes =
    manualDuration !== undefined
      ? manualDuration
      : parsed.durationMinutes ?? defaultDurationMinutes;
  const parsedReminderAt =
    canSetReminders && !manualReminderActive ? parsed.reminderAt : null;

  const chips: WebQuickAddChip[] = [];
  for (const m of parsed.matches) {
    if (m.kind === "date") {
      if (!canSetReminders || manualReminderActive || parsed.reminderAt === null) continue;
      chips.push({
        key: `date:${m.start}:${m.end}`,
        kind: "date",
        dismissToken: `date:${m.text}`,
        label: `📅 ${formatReminderPillLabel(parsed.reminderAt)}`,
      });
    } else if (m.kind === "recurrence") {
      if (!canSetReminders || !parsed.recurrence || parsed.recurrence === "none") continue;
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
      if (manualDuration !== undefined || parsed.durationMinutes == null) continue;
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
    effectiveDurationMinutes,
    parsedReminderAt,
    chips,
  };
}
