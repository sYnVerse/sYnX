import { describe, expect, it } from "vitest";

// Mirror mobile/src/utils/format helpers for pure unit coverage without RN deps.
function formatFriendlyDate(input: string | number | Date): string {
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
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function stripLeadingCategoryEmoji(name: string, emoji: string): string {
  const trimmed = name.trim();
  if (emoji && trimmed.startsWith(emoji)) {
    return trimmed.slice(emoji.length).trim();
  }
  return trimmed.replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|\uFE0F)+\s*/u, "").trim();
}

describe("mobile format helpers", () => {
  it("formats YYYY-MM-DD as a friendly weekday date", () => {
    expect(formatFriendlyDate("2026-10-22")).toBe("Thu, Oct 22");
  });

  it("strips category emoji when editing list titles", () => {
    expect(stripLeadingCategoryEmoji("🎓 French HW", "🎓")).toBe("French HW");
    expect(stripLeadingCategoryEmoji("French HW", "🎓")).toBe("French HW");
  });
});
