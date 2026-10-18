/**
 * Escape user-controlled strings for safe interpolation into HTML email templates.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build the HTML body for a reminder email (Escaped). */
export function buildReminderEmailHtml(reminderText: unknown): string {
  return `<p>${escapeHtml(reminderText)}</p>`;
}

/**
 * Sanitize a subject line: HTML-escape and collapse control/newline characters
 * so user-controlled list titles cannot inject headers or markup.
 */
export function sanitizeEmailSubject(subject: unknown, fallback = "Reminder"): string {
  const raw = String(subject ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return escapeHtml(raw || fallback).slice(0, 200);
}
