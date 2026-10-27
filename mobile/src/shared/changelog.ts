export type ChangelogCategory = "NEW" | "IMPR" | "FIX";

/**
 * Display order for changelog items within a single release:
 * new features first, then improvements, then fixes.
 *
 * Every `ChangelogCategory` must appear here exactly once. Changelog data in
 * `app/constants/changelog.ts` (web) and `mobile/src/constants/changelog.ts`
 * (mobile) is written in this order, and both What's New views also sort with
 * `sortChangelogItems` so the order holds even if an entry is added out of place.
 */
export const CHANGELOG_CATEGORY_ORDER: readonly ChangelogCategory[] = ["NEW", "IMPR", "FIX"];

export interface ChangelogItem {
  type: ChangelogCategory;
  text: string;
}

export interface ReleaseNote {
  version: string;
  date?: string;
  title?: string;
  changes: ChangelogItem[];
}

/** Position of a category in `CHANGELOG_CATEGORY_ORDER`; unknown categories sort last. */
export function changelogCategoryRank(type: ChangelogCategory): number {
  const index = CHANGELOG_CATEGORY_ORDER.indexOf(type);
  return index === -1 ? CHANGELOG_CATEGORY_ORDER.length : index;
}

/**
 * Returns a new array of items ordered NEW → IMPR → FIX. The sort is stable:
 * items of the same category keep their original relative order.
 */
export function sortChangelogItems<T extends ChangelogItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => changelogCategoryRank(a.item.type) - changelogCategoryRank(b.item.type) || a.index - b.index)
    .map(({ item }) => item);
}
