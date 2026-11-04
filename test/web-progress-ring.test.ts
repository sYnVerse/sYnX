import { describe, it, expect } from "vitest";
// useVisibleTodos has no React state or effects, so it runs as a plain
// function here; the alias keeps the hooks lint rule from treating it as one.
import { useVisibleTodos as computeVisibleTodos } from "~/features/list/hooks/useVisibleTodos";
import type { Todo } from "~/to-do-manager";
import todoPageSource from "../app/features/list/TodoPage.tsx?raw";
import uiBitsSource from "../app/features/list/components/ui-bits.tsx?raw";

function todo(id: string, completed: boolean, parentId?: string): Todo {
  return { id, listId: "list-1", text: id, completed, createdAt: 1000, priority: "none", parentId };
}

const visible = (todos: Todo[]) =>
  computeVisibleTodos({ todos, filter: "all", searchQuery: "", sortBy: "created" });

describe("web header progress ring", () => {
  it("counts subtasks in the ring but keeps the header's task counts top-level", () => {
    // Matches Chris's screenshot: one open task, one done task with done subtasks.
    const result = visible([
      todo("a", false),
      todo("b", true),
      todo("b1", true, "b"),
      todo("b2", true, "b"),
    ]);
    expect(result.progress).toEqual({ done: 3, total: 4, percent: 75 });
    expect(result.totalCount).toBe(2);
    expect(result.completedCount).toBe(1);
    expect(result.activeCount).toBe(1);
  });

  it("moves the ring when only a subtask is checked off", () => {
    expect(visible([todo("a", false), todo("a1", false, "a")]).progress.percent).toBe(0);
    expect(visible([todo("a", false), todo("a1", true, "a")]).progress.percent).toBe(50);
  });

  it("shows 0% for an empty list", () => {
    expect(visible([]).progress).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("feeds the ring from the shared progress, not its own math", () => {
    expect(todoPageSource).toContain("<ProgressRing percent={progress.percent} />");
    expect(uiBitsSource).not.toMatch(/completed \/ total/);
  });
});
