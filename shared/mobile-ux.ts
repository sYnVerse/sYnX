import { getCategoryEmoji, getCategoryTagEmoji, isPresetCategory } from "./categories";
import { getShareModeLabel } from "./list-permissions";
import { sortTasks, type TaskSortMode, type SortableTask } from "./task-sort";
import { splitCompletedTasks } from "./task-sections";

/** Mirrors types in index.ts — local to avoid circular imports. */
type ShareMode = "private" | "public_read" | "public_edit";
type PriorityLevel = "low" | "medium" | "high" | "none";

/** Re-offer soft ask at most once every 14 days after "Not now". */
export const SOFT_ASK_REASK_MS = 14 * 24 * 60 * 60 * 1000;

export type PushPermissionStatus =
  | "undetermined"
  | "granted"
  | "denied"
  | "blocked";

export interface SoftAskPolicyInput {
  permission: PushPermissionStatus;
  /** Epoch ms when user tapped Not now; null if never declined */
  declinedAt: number | null;
  /** Whether the one-time contextual reminder nudge already fired */
  contextualReminderNudged: boolean;
  /** Asking because user just set a task reminder */
  contextualReminder?: boolean;
  now?: number;
}

/**
 * Whether the 14-day back-off period after tapping "Not now" has elapsed.
 */
export function isSoftAskBackoffElapsed(
  declinedAt: number | null | undefined,
  now: number = Date.now()
): boolean {
  if (declinedAt == null || Number.isNaN(declinedAt)) {
    return true;
  }
  return now - declinedAt >= SOFT_ASK_REASK_MS;
}

/**
 * Pure soft-ask eligibility (no OS / storage). Callers supply permission + persistence.
 * Never show when granted or permanently blocked.
 */
export function evaluateSoftAskPolicy(input: SoftAskPolicyInput): boolean {
  const { permission, declinedAt, contextualReminderNudged, contextualReminder } = input;
  const now = input.now ?? Date.now();

  if (permission === "granted" || permission === "blocked") {
    return false;
  }
  // undetermined or denied-but-can-still-ask (caller maps canAskAgain=false → blocked)

  if (isSoftAskBackoffElapsed(declinedAt, now)) {
    return true;
  }

  if (contextualReminder && !contextualReminderNudged) {
    return true;
  }

  return false;
}

export interface CalendarSoftAskPolicyInput {
  syncEnabled: boolean;
  permissionGranted: boolean;
  /** Epoch ms when user tapped Not now; null if never declined */
  declinedAt: number | null | undefined;
  now?: number;
}

/**
 * Pure soft-ask eligibility for re-enabling calendar access when calendar sync is on.
 * Reuses the same 14-day "Not now" back-off policy as push notifications.
 */
export function evaluateCalendarSoftAskPolicy(input: CalendarSoftAskPolicyInput): boolean {
  if (!input.syncEnabled || input.permissionGranted) {
    return false;
  }
  return isSoftAskBackoffElapsed(input.declinedAt, input.now ?? Date.now());
}

/** Map expo permission fields → our status enum. */
export function mapExpoPermissionToStatus(input: {
  status: string;
  canAskAgain?: boolean;
}): PushPermissionStatus {
  if (input.status === "granted") return "granted";
  if (input.status === "undetermined") return "undetermined";
  if (input.canAskAgain === false) return "blocked";
  return "denied";
}

export function shouldWarnBeforeSharingPrivateList(shareMode: ShareMode): boolean {
  return shareMode === "private";
}

/**
 * Tasks header ownership line.
 * When not owner, prefer "Shared by {displayName}" over the generic fallback.
 */
export function listOwnershipLabel(
  isOwner: boolean,
  ownerDisplayName?: string | null
): string {
  if (isOwner) return "Yours";
  const name = ownerDisplayName?.trim();
  if (name) return `Shared by ${name}`;
  return "Shared with you";
}

/** Parse subtask duration field: empty → null (clear); digits → number; invalid → undefined (skip save). */
export function parseSubtaskDurationMinutes(
  durationText: string
): number | null | undefined {
  const cleaned = durationText.trim();
  if (!cleaned) return null;
  const parsed = parseInt(cleaned.replace(/\D/g, ""), 10);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const err = error as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;
}

/** e.g. "Thu, Oct 22" from YYYY-MM-DD or Date/timestamp */
export function formatFriendlyDate(
  input: string | number | Date,
  locale?: string
): string {
  let d: Date;
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, day] = input.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else if (typeof input === "number") {
    d = new Date(input);
  } else if (input instanceof Date) {
    d = input;
  } else {
    d = new Date(input);
  }
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatReminderTime(reminderAt: number, locale?: string): string {
  return new Date(reminderAt).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** User-facing toast when a recurring task is marked done and advanced. */
export function formatRescheduledToast(reminderAt: number, locale?: string): string {
  return `Rescheduled for ${formatFriendlyDate(reminderAt, locale)}`;
}

export function priorityLabel(priority: PriorityLevel): string {
  if (priority === "none") return "";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function priorityColor(
  priority: PriorityLevel,
  theme: { danger: string; accent: string; success: string; textMuted: string }
): string {
  switch (priority) {
    case "high":
      return theme.danger;
    case "medium":
      return "#D97706";
    case "low":
      return theme.success;
    default:
      return theme.textMuted;
  }
}

export function stripLeadingCategoryEmoji(name: string, emoji: string): string {
  const trimmed = name.trim();
  if (emoji && trimmed.startsWith(emoji)) {
    return trimmed.slice(emoji.length).trim();
  }
  return trimmed.replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|\uFE0F)+\s*/u, "").trim();
}

export function buildCategorizedListName(
  emoji: string,
  categoryName: string,
  title: string
): string {
  const cleaned = title.trim();
  if (!cleaned) return cleaned;
  if (!categoryName || categoryName === "Custom" || categoryName === "None" || !emoji.trim()) return cleaned;
  return `${emoji} ${cleaned}`;
}

/** Relative luminance for sRGB hex (#RGB / #RRGGBB). */
export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colors (lighter/darker ordered). */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const L1 = relativeLuminance(fgHex);
  const L2 = relativeLuminance(bgHex);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Approximate rendered height of the floating tab bar (excluding bottom insets). */
export const FLOATING_TAB_BAR_HEIGHT = 72;

/**
 * Calculates bottom offset for floating action buttons (FAB) so they always float
 * comfortably above the floating tab bar, accounting for safe area insets.
 */
export function getFabBottomOffset(insetsBottom: number, margin = 16): number {
  return FLOATING_TAB_BAR_HEIGHT + Math.max(insetsBottom, 12) + margin;
}

/**
 * Calculates bottom padding for tab-level screens (like Settings) so their scrollable
 * content is not obscured by the floating tab bar or system navigation bar.
 */
export function getTabScreenBottomPadding(insetsBottom: number, extraClearance = 24): number {
  return FLOATING_TAB_BAR_HEIGHT + Math.max(insetsBottom, 12) + extraClearance;
}

/**
 * Calculates list content padding bottom so scrollable content isn't obscured by the
 * floating tab bar or FAB.
 */
export function getListBottomPadding(insetsBottom: number): number {
  return getTabScreenBottomPadding(insetsBottom, 76);
}

/**
 * Calculates bottom padding for bottom sheets (like TaskModal, TaskBreakdownModal,
 * ListsScreen sheet, and TasksScreen activity sheet) so that action buttons at the
 * bottom remain fully above the system navigation bar (Android 3-button/gesture or iOS home indicator)
 * while preserving comfortable visual breathing room.
 */
export function getSheetBottomPadding(insetsBottom: number, basePadding = 24): number {
  return Math.max(insetsBottom, 0) + basePadding;
}

export interface PushSettingsStateInput {
  permission: PushPermissionStatus;
  hasStoredToken: boolean;
  userDisabled: boolean;
}

export interface PushSettingsStateOutput {
  pushEnabled: boolean;
  shouldAutoRegister: boolean;
  shouldUnregisterStaleToken: boolean;
  statusLabel: string;
}

export function derivePushSettingsState(input: PushSettingsStateInput): PushSettingsStateOutput {
  const { permission, hasStoredToken, userDisabled } = input;

  if (permission !== "granted") {
    return {
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: hasStoredToken,
      statusLabel:
        permission === "blocked"
          ? "Blocked in system settings"
          : permission === "denied"
          ? "Off"
          : "Not set up",
    };
  }

  if (userDisabled) {
    return {
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: false,
      statusLabel: "Off",
    };
  }

  return {
    pushEnabled: true,
    shouldAutoRegister: !hasStoredToken,
    shouldUnregisterStaleToken: false,
    statusLabel: "On",
  };
}

export interface CalendarSettingsStateInput {
  syncEnabled: boolean;
  permissionGranted: boolean;
}

export interface CalendarSettingsStateOutput {
  isWarningVisible: boolean;
  canSync: boolean;
}

export function deriveCalendarSettingsState(input: CalendarSettingsStateInput): CalendarSettingsStateOutput {
  return {
    isWarningVisible: input.syncEnabled && !input.permissionGranted,
    canSync: input.syncEnabled && input.permissionGranted,
  };
}

export interface ListRowTitleAndEmojiInput {
  name: string;
  category?: string | null;
}

export interface ListRowTitleAndEmojiResult {
  emoji: string | null;
  title: string;
}

/**
 * Returns the leading category emoji (if categorized) and the title with any
 * duplicate leading preset emoji stripped. Uncategorized lists get no emoji badge.
 */
export function formatListRowTitleAndEmoji(
  input: ListRowTitleAndEmojiInput
): ListRowTitleAndEmojiResult {
  const category = input.category?.trim() || null;
  const name = input.name.trim();

  if (!category) {
    return {
      emoji: null,
      title: name,
    };
  }

  const emoji = getCategoryTagEmoji(category);
  const presetEmoji = isPresetCategory(category) ? getCategoryEmoji(category) : "";
  const title = stripLeadingCategoryEmoji(name, presetEmoji) || name;

  return {
    emoji,
    title,
  };
}

export interface ListRowMetaInput {
  openTaskCount?: number | null;
  category?: string | null;
  shareMode?: ShareMode;
  isOwner?: boolean;
  ownerDisplayName?: string | null;
}

/**
 * Formats the muted subtitle line for a list row:
 * Owned: "<N> tasks · <Category> · <ShareMode>"
 * Shared: "<N> tasks · Shared by <Name> · <Category> · <ShareMode>"
 */
export function formatListRowMeta(input: ListRowMetaInput): string {
  const parts: string[] = [];

  if (typeof input.openTaskCount === "number" && input.openTaskCount >= 0) {
    parts.push(`${input.openTaskCount} ${input.openTaskCount === 1 ? "task" : "tasks"}`);
  }

  const category = input.category?.trim();
  const shareMode = input.shareMode || "private";

  if (input.isOwner === false) {
    parts.push(listOwnershipLabel(false, input.ownerDisplayName));
    if (category) {
      parts.push(category);
    }
    parts.push(getShareModeLabel(shareMode));
  } else {
    if (category) {
      parts.push(category);
    }
    parts.push(getShareModeLabel(shareMode));
  }

  return parts.join(" · ");
}

export interface PreviewTaskItem<T> {
  task: T;
  openSubtasks: T[];
  completedSubtaskCount: number;
}

export interface ListPreviewTasksResult<T> {
  openTasks: PreviewTaskItem<T>[];
  completedMainCount: number;
  totalMainCount: number;
}

/**
 * Groups and filters tasks for the Lists screen inline preview (#131):
 * - Hides completed main tasks and completed subtasks
 * - Sorts tasks according to sortMode
 * - Reports counts for hidden completed items and overall completion state
 */
export function buildListPreviewTasks<T extends {
  id: string;
  parentId?: string | null;
  completed: boolean;
  subtasks?: T[];
} & Partial<SortableTask>>(
  todos: readonly T[],
  sortMode?: TaskSortMode
): ListPreviewTasksResult<T> {
  const parentMap: Record<string, T & { subtasks: T[] }> = {};
  const topLevel: (T & { subtasks: T[] })[] = [];

  todos.forEach((t) => {
    if (!t.parentId) {
      const item = { ...t, subtasks: [] };
      parentMap[t.id] = item;
      topLevel.push(item);
    }
  });

  todos.forEach((st) => {
    if (st.parentId && parentMap[st.parentId]) {
      parentMap[st.parentId].subtasks.push(st as T);
    }
  });

  type PreviewSortItem = SortableTask & { subtasks?: SortableTask[] };
  const sortedTopLevel = sortMode
    ? (sortTasks(
        topLevel as unknown as PreviewSortItem[],
        sortMode
      ) as unknown as (T & { subtasks: T[] })[])
    : topLevel;

  const { active: openMain, completed: completedMain } = splitCompletedTasks(sortedTopLevel);

  const openTasks: PreviewTaskItem<T>[] = openMain.map((parent) => {
    const rawSubtasks = parent.subtasks || [];
    const { active: openSubtasks, completed: doneSubtasks } = splitCompletedTasks(rawSubtasks);
    return {
      task: parent,
      openSubtasks,
      completedSubtaskCount: doneSubtasks.length,
    };
  });

  return {
    openTasks,
    completedMainCount: completedMain.length,
    totalMainCount: sortedTopLevel.length,
  };
}
