export type PriorityLevel = "high" | "medium" | "low" | "none";

export interface PriorityConfigItem {
  label: string;
  color: string;
  bg: string;
  border: string;
  ring: string;
  dot: string;
}

export const priorityConfig: Record<PriorityLevel, PriorityConfigItem> = {
  high: {
    label: "High",
    color: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    ring: "ring-rose-500/40",
    dot: "bg-rose-400",
  },
  medium: {
    label: "Med",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    ring: "ring-amber-500/40",
    dot: "bg-amber-400",
  },
  low: {
    label: "Low",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/40",
    dot: "bg-emerald-400",
  },
  none: {
    label: "None",
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    ring: "ring-slate-500/30",
    dot: "bg-slate-400",
  },
};

export function formatReminder(reminderAt?: number, reminderSent?: boolean): string | null {
  if (!reminderAt) return null;
  if (reminderSent) return "Sent";

  const diffMs = reminderAt - Date.now();
  if (diffMs <= 0) return "Due";

  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "<1m";
  if (diffMin < 60) return `${diffMin}m`;

  const date = new Date(reminderAt);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return timeStr;
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

export function formatActivityWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
