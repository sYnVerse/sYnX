import type { TaskCompletionStats } from "./index";

/**
 * Formats an elapsed running-timer badge label (e.g. "⏱ <1m", "⏱ 12m", "⏱ 1h 5m").
 */
export function formatElapsedTimerLabel(startedAt: number, now: number): string {
  const elapsedMs = Math.max(0, now - startedAt);
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  if (totalMinutes < 1) return "⏱ <1m";
  if (totalMinutes < 60) return `⏱ ${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const rem = totalMinutes % 60;
  return rem > 0 ? `⏱ ${hours}h ${rem}m` : `⏱ ${hours}h`;
}

/**
 * Formats a compact single-line completion timing summary for task details.
 */
export function formatTaskCompletionStatsLine(
  stats: TaskCompletionStats | null | undefined,
  options: { isRecurring: boolean; estimatedMinutes?: number | null }
): string | null {
  if (!stats || stats.timedCount === 0) return null;
  const est = options.estimatedMinutes ?? stats.estimatedMinutes ?? null;

  if (options.isRecurring) {
    if (stats.averageSeconds == null) return null;
    const avgMin = Math.max(1, Math.round(stats.averageSeconds / 60));
    const base = `Avg ${avgMin} min over last ${stats.timedCount}`;
    return est != null && est > 0 ? `${base} • est ${est}` : base;
  }

  if (stats.lastDurationSeconds == null) return null;
  const tookMin = Math.max(1, Math.round(stats.lastDurationSeconds / 60));
  if (est != null && est > 0) {
    const delta = tookMin - est;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    return `Took ${tookMin} min • est ${est} (${deltaStr})`;
  }
  return `Took ${tookMin} min`;
}

/**
 * Applies an optimistic start or cancel-start update to a task item.
 */
export function applyStartTodoLocal<
  T extends { startedAt?: number | null; startedBy?: string | null },
>(todo: T, startedAt: number | null, startedBy?: string | null): T {
  if (startedAt == null) {
    return {
      ...todo,
      startedAt: undefined,
      startedBy: undefined,
    };
  }
  return {
    ...todo,
    startedAt,
    startedBy: startedBy ?? todo.startedBy ?? undefined,
  };
}
