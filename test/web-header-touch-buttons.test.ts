import { describe, it, expect } from "vitest";
import todoPageSource from "../app/features/list/TodoPage.tsx?raw";

// Touch screens have no hover, so header controls that only appear on hover
// are invisible on phones until tapped. They must stay visible there.
const headerStart = todoPageSource.indexOf("{/* Header (Active list title + Progress) */}");
const header = todoPageSource.slice(headerStart, todoPageSource.indexOf("</header>", headerStart));

describe("web list header on touch screens", () => {
  it("doesn't hide header controls behind hover alone", () => {
    expect(headerStart).toBeGreaterThan(-1);
    expect(header).toContain("Click to rename");
    expect(header).not.toMatch(/(?<![\w\]:-])opacity-0\b/);
  });

  it("shows the rename pencil and + Add Tag unless the device can hover", () => {
    const touchFriendly =
      "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100";
    const uses = header.split(touchFriendly).length - 1;
    expect(uses).toBe(2);
    expect(header).toContain("+ Add Tag");
  });
});
