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

/** Quick-pick duration options (in minutes) offered after an untimed check-off. */
export const QUICK_PICK_DURATION_MINUTES = [15, 30, 60] as const;

export interface CompletionExportRow {
  id: string;
  todoId: string;
  listId: string;
  listName: string | null;
  taskText: string;
  startedAt: number | null;
  completedAt: number;
  durationSeconds: number | null;
  estimatedMinutes: number | null;
  timeZone: string | null;
  source: string;
}

const COMPLETIONS_CSV_HEADER =
  "id,todo_id,list_id,list_name,task_text,started_at,completed_at,duration_seconds,estimated_minutes,time_zone,source";

function neutralizeCsvFormula(value: string): string {
  if (value.length === 0) return value;
  const first = value[0];
  const trimmedFirst = value.trimStart()[0];
  if (
    first === "=" ||
    first === "+" ||
    first === "-" ||
    first === "@" ||
    first === "\t" ||
    first === "\r" ||
    trimmedFirst === "=" ||
    trimmedFirst === "+" ||
    trimmedFirst === "-" ||
    trimmedFirst === "@"
  ) {
    return `'${value}`;
  }
  return value;
}

function escapeCsvCell(raw: string): string {
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatCsvIso(ts: number | null | undefined): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  return new Date(ts).toISOString();
}

/**
 * Formats completion log rows into an RFC-4180 CSV string with spreadsheet
 * formula-injection neutralization on text fields and CRLF line endings.
 */
export function formatCompletionsCsv(rows: ReadonlyArray<CompletionExportRow>): string {
  const lines: string[] = [COMPLETIONS_CSV_HEADER];
  for (const row of rows) {
    const cells = [
      escapeCsvCell(row.id),
      escapeCsvCell(row.todoId),
      escapeCsvCell(row.listId),
      escapeCsvCell(neutralizeCsvFormula(row.listName ?? "")),
      escapeCsvCell(neutralizeCsvFormula(row.taskText)),
      escapeCsvCell(formatCsvIso(row.startedAt)),
      escapeCsvCell(formatCsvIso(row.completedAt)),
      row.durationSeconds != null && Number.isFinite(row.durationSeconds)
        ? String(row.durationSeconds)
        : "",
      row.estimatedMinutes != null && Number.isFinite(row.estimatedMinutes)
        ? String(row.estimatedMinutes)
        : "",
      escapeCsvCell(row.timeZone ?? ""),
      escapeCsvCell(row.source),
    ];
    lines.push(cells.join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
