import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CreateTodoSchema, UpdateTodoSchema, parseDeepLinkUrl } from "../shared";

describe("Regression Tests: Reminder Validation, Subtask Search, and Deep Link Parsing", () => {
  describe("CreateTodoSchema & UpdateTodoSchema (Quick Reminder 'None')", () => {
    it("allows CreateTodoSchema with explicit null for reminderAt (Quick Reminder None)", () => {
      const input = {
        text: "Finish project proposal",
        listId: "list-456",
        reminderAt: null,
      };
      const result = v.parse(CreateTodoSchema, input);
      expect(result.reminderAt).toBeNull();
    });

    it("allows CreateTodoSchema with undefined reminderAt", () => {
      const input = {
        text: "Finish project proposal",
        listId: "list-456",
      };
      const result = v.parse(CreateTodoSchema, input);
      expect(result.reminderAt).toBeUndefined();
    });

    it("allows UpdateTodoSchema with explicit null for reminderAt", () => {
      const input = {
        reminderAt: null,
      };
      const result = v.parse(UpdateTodoSchema, input);
      expect(result.reminderAt).toBeNull();
    });

    it("validates subtask creation payload with parentId and listId", () => {
      const input = {
        text: "Buy 2% Organic Milk",
        listId: "list-789",
        parentId: "parent-123",
        durationMinutes: 10,
      };
      const result = v.parse(CreateTodoSchema, input);
      expect(result.listId).toBe("list-789");
      expect(result.parentId).toBe("parent-123");
    });
  });

  describe("Subtask Search Matching Logic", () => {
    const parentTask = { id: "parent-1", text: "Buy Groceries", parentId: undefined };
    const subtask = { id: "sub-1", text: "Organic Milk 2%", parentId: "parent-1" };
    const allTodos = [parentTask, subtask];

    it("includes parent task when searching for text in subtask ('Milk')", () => {
      const searchQuery = "Milk";
      const q = searchQuery.toLowerCase().trim();

      const subtasksByParent = allTodos.reduce((acc, t) => {
        if (t.parentId) {
          if (!acc[t.parentId]) acc[t.parentId] = [];
          acc[t.parentId].push(t);
        }
        return acc;
      }, {} as Record<string, typeof subtask[]>);

      const visibleParents = allTodos.filter(t => !t.parentId).filter(parent => {
        const parentMatches = parent.text.toLowerCase().includes(q);
        const subtaskMatches = (subtasksByParent[parent.id] || []).some(s => s.text.toLowerCase().includes(q));
        return parentMatches || subtaskMatches;
      });

      expect(visibleParents).toHaveLength(1);
      expect(visibleParents[0].id).toBe("parent-1");
    });

    it("includes parent task when searching for text in parent ('Groceries')", () => {
      const searchQuery = "Groceries";
      const q = searchQuery.toLowerCase().trim();

      const subtasksByParent = allTodos.reduce((acc, t) => {
        if (t.parentId) {
          if (!acc[t.parentId]) acc[t.parentId] = [];
          acc[t.parentId].push(t);
        }
        return acc;
      }, {} as Record<string, typeof subtask[]>);

      const visibleParents = allTodos.filter(t => !t.parentId).filter(parent => {
        const parentMatches = parent.text.toLowerCase().includes(q);
        const subtaskMatches = (subtasksByParent[parent.id] || []).some(s => s.text.toLowerCase().includes(q));
        return parentMatches || subtaskMatches;
      });

      expect(visibleParents).toHaveLength(1);
      expect(visibleParents[0].id).toBe("parent-1");
    });

    it("filters subtasks to only matching subtasks under parent when searching ('Milk') (Issue 106)", () => {
      const searchQuery = "Milk";
      const searchQ = searchQuery.toLowerCase().trim();

      const sub1 = { id: "sub-1", text: "Organic Milk 2%", parentId: "parent-1", createdAt: 100 };
      const sub2 = { id: "sub-2", text: "Whole Wheat Bread", parentId: "parent-1", createdAt: 200 };
      const subtasksByParent: Record<string, typeof sub1[]> = { "parent-1": [sub1, sub2] };
      const visibleParents = [{ id: "parent-1", text: "Buy Groceries", parentId: undefined }];

      const subtasksMap: Record<string, typeof sub1[]> = {};
      for (const parent of visibleParents) {
        const subs = subtasksByParent[parent.id] || [];
        const filteredSubs = searchQ
          ? subs.filter((sub) => sub.text.toLowerCase().includes(searchQ))
          : subs;
        subtasksMap[parent.id] = [...filteredSubs].sort((a, b) => a.createdAt - b.createdAt);
      }

      expect(subtasksMap["parent-1"]).toHaveLength(1);
      expect(subtasksMap["parent-1"][0].id).toBe("sub-1");
      expect(subtasksMap["parent-1"][0].text).toBe("Organic Milk 2%");
    });

    it("hides non-matching subtasks when only parent text matches search query ('Groceries') (Issue 106)", () => {
      const searchQuery = "Groceries";
      const searchQ = searchQuery.toLowerCase().trim();

      const sub1 = { id: "sub-1", text: "Organic Milk 2%", parentId: "parent-1", createdAt: 100 };
      const sub2 = { id: "sub-2", text: "Whole Wheat Bread", parentId: "parent-1", createdAt: 200 };
      const subtasksByParent: Record<string, typeof sub1[]> = { "parent-1": [sub1, sub2] };
      const visibleParents = [{ id: "parent-1", text: "Buy Groceries", parentId: undefined }];

      const subtasksMap: Record<string, typeof sub1[]> = {};
      for (const parent of visibleParents) {
        const subs = subtasksByParent[parent.id] || [];
        const filteredSubs = searchQ
          ? subs.filter((sub) => sub.text.toLowerCase().includes(searchQ))
          : subs;
        subtasksMap[parent.id] = [...filteredSubs].sort((a, b) => a.createdAt - b.createdAt);
      }

      expect(subtasksMap["parent-1"]).toHaveLength(0);
    });

    it("restores all subtasks when search query is empty (Issue 106)", () => {
      const searchQuery = "";
      const searchQ = searchQuery.toLowerCase().trim();

      const sub1 = { id: "sub-1", text: "Organic Milk 2%", parentId: "parent-1", createdAt: 100 };
      const sub2 = { id: "sub-2", text: "Whole Wheat Bread", parentId: "parent-1", createdAt: 200 };
      const subtasksByParent: Record<string, typeof sub1[]> = { "parent-1": [sub1, sub2] };
      const visibleParents = [{ id: "parent-1", text: "Buy Groceries", parentId: undefined }];

      const subtasksMap: Record<string, typeof sub1[]> = {};
      for (const parent of visibleParents) {
        const subs = subtasksByParent[parent.id] || [];
        const filteredSubs = searchQ
          ? subs.filter((sub) => sub.text.toLowerCase().includes(searchQ))
          : subs;
        subtasksMap[parent.id] = [...filteredSubs].sort((a, b) => a.createdAt - b.createdAt);
      }

      expect(subtasksMap["parent-1"]).toHaveLength(2);
      expect(subtasksMap["parent-1"].map(s => s.id)).toEqual(["sub-1", "sub-2"]);
    });
  });

  describe("Deep Link Root UUID Parsing", () => {
    const extractListId = (url: string): string | null => {
      if (!url || url.includes("/mobile/callback") || url.includes("/callback")) return null;
      const uuidMatch = url.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
      if (uuidMatch && uuidMatch[1]) {
        return uuidMatch[1];
      }
      const matchPath = url.match(/\/list\/([a-zA-Z0-9_-]+)/);
      if (matchPath && matchPath[1]) {
        return matchPath[1];
      }
      return null;
    };

    it("correctly extracts UUID from web root list URL (https://synx.christran.io/26f59db4-3add-4d77-8778-18629c01938e)", () => {
      const url = "https://synx.christran.io/26f59db4-3add-4d77-8778-18629c01938e";
      expect(extractListId(url)).toBe("26f59db4-3add-4d77-8778-18629c01938e");
    });

    it("correctly extracts UUID from custom scheme link (synx://26f59db4-3add-4d77-8778-18629c01938e)", () => {
      const url = "synx://26f59db4-3add-4d77-8778-18629c01938e";
      expect(extractListId(url)).toBe("26f59db4-3add-4d77-8778-18629c01938e");
    });

    it("ignores OAuth callback URL", () => {
      const url = "https://synx.christran.io/mobile/callback?code=123456";
      expect(extractListId(url)).toBeNull();
    });

    describe("Widget and App Deep Link Action Parsing (parseDeepLinkUrl)", () => {
      it("parses synx://list/<id> without action", () => {
        expect(parseDeepLinkUrl("synx://list/26f59db4-3add-4d77-8778-18629c01938e")).toEqual({
          listId: "26f59db4-3add-4d77-8778-18629c01938e",
          action: null,
        });
      });

      it("parses synx://list/<id>?action=newTask", () => {
        expect(parseDeepLinkUrl("synx://list/26f59db4-3add-4d77-8778-18629c01938e?action=newTask")).toEqual({
          listId: "26f59db4-3add-4d77-8778-18629c01938e",
          action: "newTask",
        });
      });

      it("parses synx://quick-add?listId=<id>", () => {
        expect(parseDeepLinkUrl("synx://quick-add?listId=26f59db4-3add-4d77-8778-18629c01938e")).toEqual({
          listId: "26f59db4-3add-4d77-8778-18629c01938e",
          action: "newTask",
        });
      });

      it("parses synx://quick-add without listId", () => {
        expect(parseDeepLinkUrl("synx://quick-add")).toEqual({
          listId: null,
          action: "newTask",
        });
      });

      it("parses https://synx.christran.io/<id>?action=newTask", () => {
        expect(parseDeepLinkUrl("https://synx.christran.io/26f59db4-3add-4d77-8778-18629c01938e?action=newTask")).toEqual({
          listId: "26f59db4-3add-4d77-8778-18629c01938e",
          action: "newTask",
        });
      });

      it("ignores OAuth callback URL", () => {
        expect(parseDeepLinkUrl("https://synx.christran.io/mobile/callback?code=123456")).toEqual({
          listId: null,
          action: null,
        });
      });
    });
  });
});
