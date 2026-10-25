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

  if (declinedAt == null || Number.isNaN(declinedAt)) {
    return true;
  }

  const elapsed = now - declinedAt;
  if (elapsed >= SOFT_ASK_REASK_MS) {
    return true;
  }

  if (contextualReminder && !contextualReminderNudged) {
    return true;
  }

  return false;
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
  if (categoryName === "Custom") return cleaned;
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
 * Calculates list content padding bottom so scrollable content isn't obscured by the
 * floating tab bar or FAB.
 */
export function getListBottomPadding(insetsBottom: number): number {
  return FLOATING_TAB_BAR_HEIGHT + Math.max(insetsBottom, 12) + 76;
}
