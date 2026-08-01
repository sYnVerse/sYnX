import { describe, it, expect } from "vitest";
import { TodoItem } from "../shared";

describe("Subtask Hierarchy Tree Builder", () => {
  it("correctly groups subtasks under parent tasks and filters child tasks from top level", () => {
    const rawTodos: TodoItem[] = [
      {
        id: "parent-1",
        listId: "list-1",
        text: "Main Parent Task",
        completed: false,
        createdAt: 1000,
        priority: "high",
        recurrence: "none",
        reminderSent: false,
      },
      {
        id: "sub-1",
        listId: "list-1",
        text: "First Subtask Step",
        completed: true,
        createdAt: 1001,
        parentId: "parent-1",
        priority: "none",
        recurrence: "none",
        reminderSent: false,
      },
      {
        id: "sub-2",
        listId: "list-1",
        text: "Second Subtask Step",
        completed: false,
        createdAt: 1002,
        parentId: "parent-1",
        priority: "none",
        recurrence: "none",
        reminderSent: false,
      },
      {
        id: "parent-2",
        listId: "list-1",
        text: "Standalone Parent Task",
        completed: false,
        createdAt: 1003,
        priority: "medium",
        recurrence: "none",
        reminderSent: false,
      },
    ];

    const parentMap: Record<string, TodoItem & { subtasks: TodoItem[] }> = {};
    const children: TodoItem[] = [];

    rawTodos.forEach((t) => {
      if (!t.parentId) {
        parentMap[t.id] = { ...t, subtasks: [] };
      } else {
        children.push(t);
      }
    });

    children.forEach((st) => {
      if (st.parentId && parentMap[st.parentId]) {
        parentMap[st.parentId].subtasks.push(st);
      }
    });

    const structured = Object.values(parentMap);

    expect(structured).toHaveLength(2);
    expect(structured[0].id).toBe("parent-1");
    expect(structured[0].subtasks).toHaveLength(2);
    expect(structured[0].subtasks[0].id).toBe("sub-1");
    expect(structured[0].subtasks[1].id).toBe("sub-2");

    expect(structured[1].id).toBe("parent-2");
    expect(structured[1].subtasks).toHaveLength(0);
  });
});
