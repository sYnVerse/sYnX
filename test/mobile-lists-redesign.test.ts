import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import listRowSource from "../mobile/src/components/ListRow.tsx?raw";
import listsScreenSource from "../mobile/src/screens/ListsScreen.tsx?raw";
import {
  formatListRowTitleAndEmoji,
  formatListRowMeta,
  buildListPreviewTasks,
} from "../shared/mobile-ux";
import {
  getOpenTaskCountsForLists,
  serializeListRow,
  serializeListRows,
  type ListRow,
} from "../app/api-helpers.server";
import type { TodoItem } from "../shared";

describe("formatListRowTitleAndEmoji (#143)", () => {
  it("strips duplicate leading emoji for preset categories and returns the category emoji", () => {
    const res = formatListRowTitleAndEmoji({
      name: "🛒 Supermarket Run",
      category: "Shopping",
    });
    expect(res).toEqual({
      emoji: "🛒",
      title: "Supermarket Run",
    });
  });

  it("returns category emoji when list title has no duplicate leading emoji", () => {
    const res = formatListRowTitleAndEmoji({
      name: "Organic Veggies",
      category: "Shopping",
    });
    expect(res).toEqual({
      emoji: "🛒",
      title: "Organic Veggies",
    });
  });

  it("returns tag emoji for custom categories and preserves list title", () => {
    const res = formatListRowTitleAndEmoji({
      name: "Project Alpha",
      category: "Work Projects",
    });
    expect(res).toEqual({
      emoji: "🏷️",
      title: "Project Alpha",
    });
  });

  it("returns null emoji for uncategorized lists and preserves title (including leading emojis)", () => {
    const res1 = formatListRowTitleAndEmoji({
      name: "🎓 My Tasks",
      category: null,
    });
    expect(res1).toEqual({
      emoji: null,
      title: "🎓 My Tasks",
    });

    const res2 = formatListRowTitleAndEmoji({
      name: "Plain List",
      category: "",
    });
    expect(res2).toEqual({
      emoji: null,
      title: "Plain List",
    });
  });
});

describe("formatListRowMeta (#143)", () => {
  it("formats owned lists with task count, category, and share mode", () => {
    expect(
      formatListRowMeta({
        openTaskCount: 12,
        category: "Shopping",
        shareMode: "private",
        isOwner: true,
      })
    ).toBe("12 tasks · Shopping · Private");

    expect(
      formatListRowMeta({
        openTaskCount: 1,
        category: "Study",
        shareMode: "public_read",
        isOwner: true,
      })
    ).toBe("1 task · Study · View-Only");

    expect(
      formatListRowMeta({
        openTaskCount: 0,
        category: null,
        shareMode: "public_edit",
        isOwner: true,
      })
    ).toBe("0 tasks · Collaborative");
  });

  it("formats shared lists with owner attribution", () => {
    expect(
      formatListRowMeta({
        openTaskCount: 5,
        category: "Work",
        shareMode: "public_edit",
        isOwner: false,
        ownerDisplayName: "Alex",
      })
    ).toBe("5 tasks · Shared by Alex · Work · Collaborative");

    expect(
      formatListRowMeta({
        openTaskCount: 3,
        category: null,
        shareMode: "public_read",
        isOwner: false,
        ownerDisplayName: "  ",
      })
    ).toBe("3 tasks · Shared with you · View-Only");
  });

  it("omits task count cleanly when openTaskCount is null or undefined", () => {
    expect(
      formatListRowMeta({
        category: "Fitness",
        shareMode: "private",
        isOwner: true,
      })
    ).toBe("Fitness · Private");
  });
});

describe("buildListPreviewTasks (#131 & #143)", () => {
  const makeTask = (id: string, opts: Partial<TodoItem> = {}): TodoItem => ({
    id,
    listId: "list-1",
    text: id,
    completed: false,
    createdAt: Date.now(),
    priority: "none",
    reminderSent: false,
    recurrence: "none",
    ...opts,
  });

  it("hides completed main tasks and completed subtasks from preview", () => {
    const todos: TodoItem[] = [
      makeTask("open-1"),
      makeTask("done-1", { completed: true }),
      makeTask("open-2"),
      // Subtasks under open-1: 1 open, 2 completed
      makeTask("sub-open-1", { parentId: "open-1" }),
      makeTask("sub-done-1", { parentId: "open-1", completed: true }),
      makeTask("sub-done-2", { parentId: "open-1", completed: true }),
      // Subtasks under done-1: all completed
      makeTask("sub-done-3", { parentId: "done-1", completed: true }),
    ];

    const result = buildListPreviewTasks(todos);

    expect(result.totalMainCount).toBe(3); // open-1, done-1, open-2
    expect(result.completedMainCount).toBe(1); // done-1
    expect(result.openTasks).toHaveLength(2); // open-1, open-2

    const first = result.openTasks[0];
    expect(first.task.id).toBe("open-1");
    expect(first.openSubtasks.map((s) => s.id)).toEqual(["sub-open-1"]);
    expect(first.completedSubtaskCount).toBe(2);

    const second = result.openTasks[1];
    expect(second.task.id).toBe("open-2");
    expect(second.openSubtasks).toEqual([]);
    expect(second.completedSubtaskCount).toBe(0);
  });

  it("detects all-done state when all main tasks are completed", () => {
    const todos: TodoItem[] = [
      makeTask("done-1", { completed: true }),
      makeTask("done-2", { completed: true }),
    ];

    const result = buildListPreviewTasks(todos);
    expect(result.totalMainCount).toBe(2);
    expect(result.openTasks).toHaveLength(0);
    expect(result.completedMainCount).toBe(2);
  });

  it("handles completely empty task list", () => {
    const result = buildListPreviewTasks([]);
    expect(result.totalMainCount).toBe(0);
    expect(result.openTasks).toHaveLength(0);
    expect(result.completedMainCount).toBe(0);
  });

  it("orders preview tasks using sortMode", () => {
    const todos: TodoItem[] = [
      makeTask("b-task", { text: "Beta", createdAt: 1 }),
      makeTask("a-task", { text: "Alpha", createdAt: 2 }),
      makeTask("c-task", { text: "Gamma", createdAt: 3 }),
    ];

    const alphaSorted = buildListPreviewTasks(todos, "alphabetical");
    expect(alphaSorted.openTasks.map((t) => t.task.text)).toEqual(["Alpha", "Beta", "Gamma"]);

    const createdSorted = buildListPreviewTasks(todos, "created");
    expect(createdSorted.openTasks.map((t) => t.task.text)).toEqual(["Gamma", "Alpha", "Beta"]);
  });
});

describe("D1 open task counts and list serialization (#143)", () => {
  let db: D1Database;
  const testUserId = "user-open-task-tester";

  beforeEach(async () => {
    db = env.DB;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
  });

  it("getOpenTaskCountsForLists counts only open top-level tasks per list", async () => {
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("list-a", "List A", testUserId, Date.now(), "private")
      .run();

    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("list-b", "List B", testUserId, Date.now(), "private")
      .run();

    // In list-a:
    // 2 open main tasks
    // 1 completed main task
    // 2 subtasks (1 open, 1 completed) under an open main task (must NOT be counted in openTaskCount)
    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("t1", "list-a", "Open 1", 0, Date.now(), null)
      .run();
    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("t2", "list-a", "Open 2", 0, Date.now(), null)
      .run();
    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("t3", "list-a", "Done 1", 1, Date.now(), null)
      .run();
    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("st1", "list-a", "Sub Open", 0, Date.now(), "t1")
      .run();
    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("st2", "list-a", "Sub Done", 1, Date.now(), "t1")
      .run();

    // In list-b: 0 open main tasks, 1 completed main task
    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("tb1", "list-b", "Done in B", 1, Date.now(), null)
      .run();

    const counts = await getOpenTaskCountsForLists(db, ["list-a", "list-b", "list-empty"]);
    expect(counts.get("list-a")).toBe(2);
    expect(counts.get("list-b")).toBe(0);
    expect(counts.get("list-empty")).toBe(0);
  });

  it("serializeListRows includes openTaskCount additively on all list rows", async () => {
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("list-c", "List C", testUserId, Date.now(), "private")
      .run();

    await db
      .prepare("INSERT INTO todos (id, list_id, text, completed, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("tc1", "list-c", "Task 1", 0, Date.now(), null)
      .run();

    const row: ListRow = {
      id: "list-c",
      name: "List C",
      owner_id: testUserId,
      created_at: Date.now(),
      expiration_ttl: null,
      share_mode: "private",
      category: null,
    };

    const [serialized] = await serializeListRows(db, [row], testUserId);
    expect(serialized.openTaskCount).toBe(1);

    const singleSerialized = await serializeListRow(db, row, { viewerUserId: testUserId });
    expect(singleSerialized.openTaskCount).toBe(1);
  });
});

describe("ListRow and ListsScreen component and accessibility source checks (#143 & #131)", () => {
  it("ListRow renders 1-line title and meta text", () => {
    expect(listRowSource).toContain('numberOfLines={1}');
    expect(listRowSource).toContain('formatListRowTitleAndEmoji');
    expect(listRowSource).toContain('formatListRowMeta');
  });

  it("ListRow renders subtle Pin and Check status indicators and a MoreHorizontal button", () => {
    expect(listRowSource).toContain("<Pin");
    expect(listRowSource).toContain("<Check");
    expect(listRowSource).toContain("<MoreHorizontal");
    expect(listRowSource).toContain("onLongPress");
    expect(listRowSource).toContain("accessibilityActions");
  });

  it("ListRow handles #131 preview states", () => {
    expect(listRowSource).toContain("TASKS IN THIS LIST");
    expect(listRowSource).toContain("All done! Every task in this list is completed.");
    expect(listRowSource).toContain("No tasks in this list yet. Tap to add tasks!");
    expect(listRowSource).toContain("{completedSubtaskCount} completed");
    expect(listRowSource).toContain("{previewData.completedMainCount} completed");
  });

  it("ListsScreen provides header toggle and header New List button without floating FAB", () => {
    expect(listsScreenSource).toContain("getListsViewMode");
    expect(listsScreenSource).toContain("setListsViewMode");
    expect(listsScreenSource).toContain("<ListTree");
    expect(listsScreenSource).toContain("<List");
    expect(listsScreenSource).toContain("FolderPlus");
    expect(listsScreenSource).toContain("getTabScreenBottomPadding(insets.bottom)");
    // FAB is removed so it never covers buttons
    expect(listsScreenSource).not.toContain("styles.fab");
  });

  it("ListsScreen action sheet exposes pin, share, edit, activity, and delete", () => {
    expect(listsScreenSource).toContain("actionSheetList");
    expect(listsScreenSource).toContain("setActionSheetList");
    expect(listsScreenSource).toContain("Share list access");
    expect(listsScreenSource).toContain("Edit list details");
    expect(listsScreenSource).toContain("View shared activity");
    expect(listsScreenSource).toContain("Delete list");
    expect(listsScreenSource).toContain("Request list deletion");
    expect(listsScreenSource).toContain("Remove from Shared with me");
  });
});
