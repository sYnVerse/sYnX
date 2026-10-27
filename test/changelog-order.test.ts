import { describe, expect, it } from "vitest";
import {
  CHANGELOG_CATEGORY_ORDER,
  changelogCategoryRank,
  sortChangelogItems,
  type ChangelogCategory,
  type ChangelogItem,
  type ReleaseNote,
} from "../shared/changelog";
import { WEB_CHANGELOG } from "../app/constants/changelog";
import { MOBILE_CHANGELOG } from "../mobile/src/constants/changelog";

describe("changelog category order", () => {
  it("is NEW, then IMPR, then FIX", () => {
    expect(CHANGELOG_CATEGORY_ORDER).toEqual(["NEW", "IMPR", "FIX"]);
  });

  it("ranks each category by its position", () => {
    expect(changelogCategoryRank("NEW")).toBe(0);
    expect(changelogCategoryRank("IMPR")).toBe(1);
    expect(changelogCategoryRank("FIX")).toBe(2);
    expect(changelogCategoryRank("OTHER" as ChangelogCategory)).toBe(CHANGELOG_CATEGORY_ORDER.length);
  });

  it("sorts items stably without mutating the input", () => {
    const items: ChangelogItem[] = [
      { type: "FIX", text: "fix 1" },
      { type: "IMPR", text: "impr 1" },
      { type: "NEW", text: "new 1" },
      { type: "FIX", text: "fix 2" },
      { type: "NEW", text: "new 2" },
      { type: "IMPR", text: "impr 2" },
    ];
    const snapshot = items.map((item) => item.text);

    expect(sortChangelogItems(items).map((item) => item.text)).toEqual([
      "new 1",
      "new 2",
      "impr 1",
      "impr 2",
      "fix 1",
      "fix 2",
    ]);
    expect(items.map((item) => item.text)).toEqual(snapshot);
  });
});

describe.each([
  ["web", WEB_CHANGELOG],
  ["mobile", MOBILE_CHANGELOG],
] as [string, ReleaseNote[]][])("%s changelog entries", (_surface, changelog) => {
  it("only use known categories", () => {
    for (const release of changelog) {
      for (const item of release.changes) {
        expect(CHANGELOG_CATEGORY_ORDER, `${release.version}: ${item.text}`).toContain(item.type);
      }
    }
  });

  it.each(changelog.map((release) => [release.version, release] as const))(
    "%s lists NEW, then IMPR, then FIX items",
    (_version, release) => {
      expect(release.changes.map((item) => item.type)).toEqual(
        sortChangelogItems(release.changes).map((item) => item.type)
      );
    }
  );
});
