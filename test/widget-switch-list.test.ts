import { describe, it, expect } from "vitest";
import pinnedWidgetSource from "../mobile/src/widgets/PinnedListWidget.tsx?raw";
import currentWidgetSource from "../mobile/src/widgets/CurrentListWidget.tsx?raw";
import listsScreenSource from "../mobile/src/screens/ListsScreen.tsx?raw";
import navigatorSource from "../mobile/src/navigation/BottomTabNavigator.tsx?raw";
import { PICK_PINNED_LIST_URL, parseDeepLinkUrl } from "../shared";

describe("switching the Pinned List widget's list (#108)", () => {
  it("parses the widget's switch link as a pick request, not as a list ID", () => {
    expect(parseDeepLinkUrl(PICK_PINNED_LIST_URL)).toEqual({ listId: null, action: "pickPinnedList" });
    expect(parseDeepLinkUrl("synx://pick-pinned-list/")).toEqual({ listId: null, action: "pickPinnedList" });
    expect(parseDeepLinkUrl("SYNX://Pick-Pinned-List")).toEqual({ listId: null, action: "pickPinnedList" });
  });

  it("doesn't treat look-alike links as a pick request", () => {
    expect(parseDeepLinkUrl("synx://pick-pinned-lists").action).not.toBe("pickPinnedList");
    expect(parseDeepLinkUrl("https://synx.christran.io/pick-pinned-list").action).toBeNull();
  });

  it("still parses list links the same way", () => {
    const id = "26f59db4-3add-4d77-8778-18629c01938e";
    expect(parseDeepLinkUrl(`synx://list/${id}`)).toEqual({ listId: id, action: null });
    expect(parseDeepLinkUrl(`synx://list/${id}?action=newTask`)).toEqual({ listId: id, action: "newTask" });
  });

  it("gives the Pinned List widget a switch button that opens the pick link", () => {
    // Widget code can't import shared constants, so check the literal matches.
    expect(pinnedWidgetSource).toContain(`target="open:${PICK_PINNED_LIST_URL}"`);
    // Tapping the list name still opens the list.
    expect(pinnedWidgetSource).toContain("target={`open:synx://list/${props.listId}`}");
  });

  it("leaves the Active List widget without a switch button", () => {
    expect(currentWidgetSource).not.toContain("pick-pinned-list");
  });

  it("opens the Lists tab in pick mode for the pick link", () => {
    expect(navigatorSource).toMatch(/parsed\.action === "pickPinnedList"[\s\S]*?setActiveTab\("lists"\)/);
    expect(navigatorSource).toContain("pickPinnedListRequestId={pickPinnedListRequest}");
  });

  it("pins the tapped list and keeps the widget's list or Up Next view", () => {
    expect(listsScreenSource).toMatch(/if \(pickingPinnedList\) \{\s*void pickPinnedList\(item\);/);
    expect(listsScreenSource).toContain('await pinListToWidget(item, pinnedConfig?.mode ?? "list");');
    // Pinning saves the choice and updates the widget right away.
    expect(listsScreenSource).toMatch(
      /const pinListToWidget = async[\s\S]*?await setPinnedWidgetConfig\(newConfig\);[\s\S]*?await syncPinnedList\(item\.id, item, undefined, queryClient\);/
    );
  });
});
