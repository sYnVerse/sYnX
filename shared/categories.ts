export interface CategoryOption {
  name: string;
  emoji: string;
}

export const PRESET_CATEGORIES: readonly CategoryOption[] = [
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

export const CATEGORY_EMOJIS: Record<string, string> = Object.fromEntries(
  PRESET_CATEGORIES.map((c) => [c.name, c.emoji])
);

/**
 * Returns true if the given category name is one of the built-in preset categories
 * (excluding "Custom" and custom user-provided names).
 */
export function isPresetCategory(category?: string | null): boolean {
  if (!category || category === "Custom") return false;
  return Object.hasOwn(CATEGORY_EMOJIS, category);
}

/**
 * Returns the emoji corresponding to the category, falling back to 📋 for unset or unknown categories.
 * Uses an own-property check so Object.prototype keys (e.g. "constructor") cannot match.
 */
export function getCategoryEmoji(category?: string | null): string {
  if (!category || !Object.hasOwn(CATEGORY_EMOJIS, category)) {
    return "📋";
  }
  return CATEGORY_EMOJIS[category];
}

/**
 * Emoji for a list's category tag: a preset category (Shopping, Movies, ...)
 * gets its own emoji, the same one mobile shows, and a custom category gets 🏷️.
 */
export function getCategoryTagEmoji(category?: string | null): string {
  if (!category || category === "Custom" || !Object.hasOwn(CATEGORY_EMOJIS, category)) {
    return "🏷️";
  }
  return CATEGORY_EMOJIS[category];
}
