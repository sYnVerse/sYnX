import { describe, it, expect } from "vitest";
import { getCategoryEmoji, getCategoryTagEmoji } from "../shared";
import todoPageSource from "../app/features/list/TodoPage.tsx?raw";

describe("getCategoryTagEmoji", () => {
  it("gives preset categories the same emoji mobile shows", () => {
    for (const cat of ["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness"]) {
      expect(getCategoryTagEmoji(cat)).toBe(getCategoryEmoji(cat));
    }
    expect(getCategoryTagEmoji("Shopping")).toBe("🛒");
    expect(getCategoryTagEmoji("Movies")).toBe("🎬");
  });

  it("gives custom categories a tag", () => {
    expect(getCategoryTagEmoji("Groceries for Mom")).toBe("🏷️");
    expect(getCategoryTagEmoji("shopping")).toBe("🏷️"); // presets match exactly
    expect(getCategoryTagEmoji("Custom")).toBe("🏷️");
    expect(getCategoryTagEmoji("")).toBe("🏷️");
    expect(getCategoryTagEmoji(null)).toBe("🏷️");
    expect(getCategoryTagEmoji(undefined)).toBe("🏷️");
  });

  it("doesn't match built-in object keys as presets", () => {
    expect(getCategoryTagEmoji("constructor")).toBe("🏷️");
    expect(getCategoryTagEmoji("toString")).toBe("🏷️");
    expect(getCategoryTagEmoji("__proto__")).toBe("🏷️");
  });

  it("is used for the web list header's tag", () => {
    expect(todoPageSource).toContain("{getCategoryTagEmoji(cat)} {cat}");
    expect(todoPageSource).not.toContain("🏷️ {cat}");
  });
});
