import { describe, it, expect } from "vitest";
import {
  buildReminderEmailHtml,
  escapeHtml,
  sanitizeEmailSubject,
} from "../app/html-escape.server";

describe("escapeHtml / reminder email templates", () => {
  it("escapes HTML special characters (before → after)", () => {
    const malicious = `<img src=x onerror=alert(1)>XSS & "quotes"`;
    // BEFORE (vulnerable pattern used previously): raw interpolation would keep tags
    const before = `<p>${malicious}</p>`;
    expect(before).toContain("<img");
    expect(before).toContain("onerror=");

    // AFTER: escaped — tags are text, not markup
    const after = buildReminderEmailHtml(malicious);
    expect(after).toBe(
      "<p>&lt;img src=x onerror=alert(1)&gt;XSS &amp; &quot;quotes&quot;</p>",
    );
    expect(after).not.toContain("<img");
    expect(after).toContain("&lt;img");
    expect(after).toContain("&gt;");
    expect(after).toContain("&amp;");
    expect(after).toContain("&quot;");
  });

  it("escapes angle brackets, ampersands, and quotes via escapeHtml", () => {
    expect(escapeHtml(`<script>alert('x')</script>`)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
    expect(escapeHtml(`a & b`)).toBe("a &amp; b");
  });

  it("sanitizes email subject from user-controlled list titles", () => {
    const before = `Buy milk</title><script>alert(1)</script>`;
    expect(before).toContain("<script>");

    const after = sanitizeEmailSubject(before);
    expect(after).toBe("Buy milk&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(after).not.toContain("<script>");
  });

  it("strips newlines/control chars from subjects and falls back when empty", () => {
    expect(sanitizeEmailSubject("Line1\r\nBcc: evil@example.com")).toBe(
      "Line1 Bcc: evil@example.com",
    );
    expect(sanitizeEmailSubject("   ")).toBe("Reminder");
    expect(sanitizeEmailSubject(null)).toBe("Reminder");
  });
});
