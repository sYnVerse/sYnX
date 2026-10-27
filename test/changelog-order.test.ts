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

describe("changelog category order helpers", () => {
  it("defines the order as NEW, then IMPR, then FIX", () => {
    expect(CHANGELOG_CATEGORY_ORDER).toEqual(["NEW", "IMPR", "FIX"]);
  });

  it("ranks categories by position and puts unknown types last", () => {
    expect(CHANGELOG_CATEGORY_ORDER.map(changelogCategoryRank)).toEqual([0, 1, 2]);
    expect(changelogCategoryRank("OTHER" as ChangelogCategory)).toBe(CHANGELOG_CATEGORY_ORDER.length);
  });

  it("sorts stably within a category without mutating the input", () => {
    const items: ChangelogItem[] = [
      { type: "FIX", text: "fix 1" },
      { type: "IMPR", text: "impr 1" },
      { type: "NEW", text: "new 1" },
      { type: "FIX", text: "fix 2" },
      { type: "NEW", text: "new 2" },
      { type: "IMPR", text: "impr 2" },
    ];
    const original = items.map((item) => item.text);

    expect(sortChangelogItems(items).map((item) => item.text)).toEqual([
      "new 1",
      "new 2",
      "impr 1",
      "impr 2",
      "fix 1",
      "fix 2",
    ]);
    expect(items.map((item) => item.text)).toEqual(original);
  });
});

function expectChangelogOrdered(changelog: ReleaseNote[]) {
  for (const release of changelog) {
    const types = release.changes.map((item) => item.type);
    for (const type of types) {
      expect(CHANGELOG_CATEGORY_ORDER, `${release.version} uses unknown category "${type}"`).toContain(type);
    }
    expect(types, `${release.version} items must be ordered NEW, then IMPR, then FIX`).toEqual(
      sortChangelogItems(release.changes).map((item) => item.type)
    );
  }
}

describe("changelog entries follow the category order", () => {
  it("web: every version lists NEW, then IMPR, then FIX with known categories", () => {
    expectChangelogOrdered(WEB_CHANGELOG);
  });

  it("mobile: every version lists NEW, then IMPR, then FIX with known categories", () => {
    expectChangelogOrdered(MOBILE_CHANGELOG);
  });
});
