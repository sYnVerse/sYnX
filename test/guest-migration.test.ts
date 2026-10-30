import { describe, it, expect } from "vitest";
import { remapGuestTodoIds } from "../app/guest-migration";

function sequentialIds(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}

describe("guest list migration id remapping", () => {
  it("points subtasks at their parent's new id within the same list", () => {
    const result = remapGuestTodoIds(
      [
        { id: "guest-parent" },
        { id: "guest-child", parentId: "guest-parent" },
      ],
      sequentialIds(),
    );
    expect(result).toEqual([
      { id: "new-1", parentId: null },
      { id: "new-2", parentId: "new-1" },
    ]);
  });

  it("keeps the link when a subtask comes before its parent", () => {
    const result = remapGuestTodoIds(
      [
        { id: "guest-child", parentId: "guest-parent" },
        { id: "guest-parent" },
      ],
      sequentialIds(),
    );
    expect(result[0].parentId).toBe(result[1].id);
  });

  it("drops a parent that isn't in the list, and ignores non-string parent ids", () => {
    const result = remapGuestTodoIds(
      [
        { id: "guest-child", parentId: "task-in-another-list" },
        { id: "guest-other", parentId: 42 },
        { parentId: "guest-child" },
      ],
      sequentialIds(),
    );
    expect(result[0]).toEqual({ id: "new-1", parentId: null });
    expect(result[1]).toEqual({ id: "new-2", parentId: null });
    // A task with no id still gets a fresh one and keeps its in-list parent.
    expect(result[2]).toEqual({ id: "new-3", parentId: "new-1" });
  });

  it("never reuses the guest ids", () => {
    const result = remapGuestTodoIds([{ id: "a" }, { id: "b", parentId: "a" }]);
    expect(result.map((t) => t.id)).not.toContain("a");
    expect(result.map((t) => t.id)).not.toContain("b");
    expect(new Set(result.map((t) => t.id)).size).toBe(2);
    expect(result[1].parentId).toBe(result[0].id);
  });
});
