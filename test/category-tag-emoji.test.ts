import { describe, it, expect } from "vitest";
import {
  PRESET_CATEGORIES,
  PRESET_CATEGORIES as SHARED_INDEX_PRESETS,
  CATEGORY_EMOJIS,
  isPresetCategory,
  getCategoryEmoji,
  getCategoryTagEmoji,
} from "../shared";
import * as sharedCategories from "../shared/categories";
import * as mobileCategories from "../mobile/src/shared/categories";
import { PRESET_CATEGORIES as MOBILE_INDEX_PRESETS } from "../mobile/src/shared";
import sharedCategoriesSource from "../shared/categories.ts?raw";
import mobileCategoriesSource from "../mobile/src/shared/categories.ts?raw";
import todoPageSource from "../app/features/list/TodoPage.tsx?raw";
import listDialogsSource from "../app/features/list/components/ListDialogs.tsx?raw";
import listsScreenSource from "../mobile/src/screens/ListsScreen.tsx?raw";

const allSources: Record<string, string> = {
  ...import.meta.glob<string>("../app/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("../mobile/src/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

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

describe("shared PRESET_CATEGORIES and helpers", () => {
  const expectedPresets = [
    { name: "Checklist", emoji: "📋" },
    { name: "Study", emoji: "🎓" },
    { name: "Shopping", emoji: "🛒" },
    { name: "Movies", emoji: "🎬" },
    { name: "Work", emoji: "💼" },
    { name: "Personal", emoji: "🏠" },
    { name: "Travel", emoji: "✈️" },
    { name: "Fitness", emoji: "💪" },
    { name: "Custom", emoji: "✏️" },
  ];

  it("defines the preset categories in display order with their emojis", () => {
    expect(PRESET_CATEGORIES).toEqual(expectedPresets);
  });

  it("builds CATEGORY_EMOJIS matching the presets", () => {
    for (const { name, emoji } of expectedPresets) {
      expect(CATEGORY_EMOJIS[name]).toBe(emoji);
    }
  });

  it("getCategoryEmoji falls back to 📋 for unknown categories or prototype keys", () => {
    expect(getCategoryEmoji("Work")).toBe("💼");
    expect(getCategoryEmoji("Custom")).toBe("✏️");
    expect(getCategoryEmoji("")).toBe("📋");
    expect(getCategoryEmoji(null)).toBe("📋");
    expect(getCategoryEmoji(undefined)).toBe("📋");
    expect(getCategoryEmoji("NonExistent")).toBe("📋");
    expect(getCategoryEmoji("constructor")).toBe("📋");
    expect(getCategoryEmoji("toString")).toBe("📋");
    expect(getCategoryEmoji("__proto__")).toBe("📋");
  });

  it("isPresetCategory identifies non-custom preset categories", () => {
    for (const name of ["Checklist", "Study", "Shopping", "Movies", "Work", "Personal", "Travel", "Fitness"]) {
      expect(isPresetCategory(name)).toBe(true);
    }
    expect(isPresetCategory("Custom")).toBe(false);
    expect(isPresetCategory("")).toBe(false);
    expect(isPresetCategory(null)).toBe(false);
    expect(isPresetCategory(undefined)).toBe(false);
    expect(isPresetCategory("Project Alpha")).toBe(false);
    expect(isPresetCategory("constructor")).toBe(false);
  });

  it("is exported from shared/index for web and mobile", () => {
    expect(SHARED_INDEX_PRESETS).toBe(sharedCategories.PRESET_CATEGORIES);
    expect(MOBILE_INDEX_PRESETS).toEqual(sharedCategories.PRESET_CATEGORIES);
  });

  it("mobile's mirrored copy matches the shared one", () => {
    expect(mobileCategoriesSource).toBe(sharedCategoriesSource);
    expect(mobileCategories.PRESET_CATEGORIES).toEqual(sharedCategories.PRESET_CATEGORIES);
    expect(mobileCategories.CATEGORY_EMOJIS).toEqual(sharedCategories.CATEGORY_EMOJIS);
    for (const { name } of PRESET_CATEGORIES) {
      expect(mobileCategories.isPresetCategory(name)).toBe(isPresetCategory(name));
      expect(mobileCategories.getCategoryEmoji(name)).toBe(getCategoryEmoji(name));
      expect(mobileCategories.getCategoryTagEmoji(name)).toBe(getCategoryTagEmoji(name));
    }
  });
});

describe("source checks: category presets are not hardcoded in UI components", () => {
  it("ListDialogs renders both pickers from PRESET_CATEGORIES and shows emojis", () => {
    expect(listDialogsSource).toContain("PRESET_CATEGORIES.map");
    expect(listDialogsSource).toContain("{emoji} {name}");
  });

  it("TodoPage uses isPresetCategory helper instead of hardcoded array", () => {
    expect(todoPageSource).toContain("isPresetCategory(cat)");
  });

  it("ListsScreen uses shared PRESET_CATEGORIES directly without alias", () => {
    expect(listsScreenSource).toContain("PRESET_CATEGORIES");
    expect(listsScreenSource).not.toContain("CATEGORY_OPTIONS");
  });

  it("no file under app/ or mobile/src/ (outside shared) hardcodes three or more preset category names", () => {
    const presetNames = PRESET_CATEGORIES.map((c) => c.name);
    const offendingFiles: { file: string; matches: string[] }[] = [];

    for (const [filePath, content] of Object.entries(allSources)) {
      if (filePath.includes("/shared/")) continue;
      const matched = presetNames.filter((name) =>
        new RegExp(`["'\`]${name}["'\`]`).test(content)
      );
      if (matched.length >= 3) {
        offendingFiles.push({ file: filePath, matches: matched });
      }
    }

    expect(offendingFiles).toEqual([]);
  });
});
