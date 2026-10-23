import type { PriorityLevel } from "../shared";

/** e.g. "Thu, Oct 22" from YYYY-MM-DD or Date/timestamp */
export function formatFriendlyDate(input: string | number | Date): string {
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
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** e.g. "9:00 AM" from reminder timestamp */
export function formatReminderTime(reminderAt: number): string {
  return new Date(reminderAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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

/** Strip leading category emoji when editing so we can re-apply consistently. */
export function stripLeadingCategoryEmoji(name: string, emoji: string): string {
  const trimmed = name.trim();
  if (emoji && trimmed.startsWith(emoji)) {
    return trimmed.slice(emoji.length).trim();
  }
  // Strip a leading emoji / symbol + optional space (avoid unicode property escapes for RN Hermes)
  return trimmed.replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|\uFE0F)+\s*/u, "").trim();
}
