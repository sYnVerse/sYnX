import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCreateList, handleUpdateListCategory } from "../app/features/list/actions/lists.server";
import { handleMigrateGuestLists } from "../app/features/list/actions/account.server";
import { serializeListRow, type ListRow } from "../app/api-helpers.server";
import type { ListActionContext } from "../app/features/list/actions/context";

const testUserId = "user-category-tester";

describe("List category support and optionality (#139)", () => {
  let db: D1Database;
  const loggedActivity: Array<{ summary: string; action: string }> = [];

  const mockScheduleActivityLog = (entry: any) => {
    loggedActivity.push({ summary: entry.summary, action: entry.action });
  };

  const makeCtx = (formData: FormData, overrides: Partial<ListActionContext> = {}): ListActionContext => ({
    isLoggedIn: true,
    userId: testUserId,
    email: "test@example.com",
    formData,
    db,
    activeListId: "",
    intent: "",
    hasOwnership: true,
    isCollaborative: false,
    activeShareMode: "private",
    listOwnerId: testUserId,
    todoManager: null as any,
    env: {} as any,
    scheduleActivityLog: mockScheduleActivityLog,
    request: new Request("http://localhost/"),
    waitUntil: () => {},
    ...overrides,
  });

  beforeEach(async () => {
    db = env.DB;
    loggedActivity.length = 0;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM list_activity");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
  });

  it("handleCreateList creates an uncategorized list (category = null) when omitted or blank", async () => {
    const formData = new FormData();
    formData.append("listName", "Uncategorized List");

    const res = await handleCreateList(makeCtx(formData));
    expect(res.status).toBe(302);
    const redirectUrl = res.headers.get("Location")!;
    const newListId = redirectUrl.replace("/", "");

    const row = await db
      .prepare("SELECT * FROM lists WHERE id = ?")
      .bind(newListId)
      .first<ListRow>();

    expect(row).not.toBeNull();
    expect(row?.name).toBe("Uncategorized List");
    expect(row?.category).toBeNull();
  });

  it("handleCreateList creates a categorized list when a category is provided", async () => {
    const formData = new FormData();
    formData.append("listName", "Work Projects");
    formData.append("category", "Work");

    const res = await handleCreateList(makeCtx(formData));
    expect(res.status).toBe(302);
    const redirectUrl = res.headers.get("Location")!;
    const newListId = redirectUrl.replace("/", "");

    const row = await db
      .prepare("SELECT * FROM lists WHERE id = ?")
      .bind(newListId)
      .first<ListRow>();

    expect(row).not.toBeNull();
    expect(row?.name).toBe("Work Projects");
    expect(row?.category).toBe("Work");
  });

  it("handleUpdateListCategory clears category to null and records 'Category: X → None' activity log", async () => {
    const listId = "list-with-existing-cat";
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode, category) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(listId, "Shopping List", testUserId, Date.now(), "private", "Shopping")
      .run();

    const formData = new FormData();
    formData.append("listId", listId);
    formData.append("category", ""); // clear category

    const res = await handleUpdateListCategory(makeCtx(formData, { activeListId: listId }));
    expect(res).toEqual({ success: true });

    const row = await db
      .prepare("SELECT * FROM lists WHERE id = ?")
      .bind(listId)
      .first<ListRow>();

    expect(row?.category).toBeNull();
    expect(loggedActivity).toContainEqual({
      action: "list_settings_changed",
      summary: "Category: Shopping → None",
    });
  });

  it("handleUpdateListCategory assigns a category to an uncategorized list and records 'Category: None → X'", async () => {
    const listId = "list-without-cat";
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode, category) VALUES (?, ?, ?, ?, ?, NULL)")
      .bind(listId, "Bare List", testUserId, Date.now(), "private")
      .run();

    const formData = new FormData();
    formData.append("listId", listId);
    formData.append("category", "Personal");

    const res = await handleUpdateListCategory(makeCtx(formData, { activeListId: listId }));
    expect(res).toEqual({ success: true });

    const row = await db
      .prepare("SELECT * FROM lists WHERE id = ?")
      .bind(listId)
      .first<ListRow>();

    expect(row?.category).toBe("Personal");
    expect(loggedActivity).toContainEqual({
      action: "list_settings_changed",
      summary: "Category: None → Personal",
    });
  });

  it("serializeListRow formats category as null for uncategorized lists instead of defaulting to Checklist", async () => {
    const row: ListRow = {
      id: "uncategorized-1",
      name: "Plain List",
      owner_id: testUserId,
      created_at: Date.now(),
      expiration_ttl: null,
      share_mode: "private",
      category: null,
    };

    const formatted = await serializeListRow(db, row, { viewerUserId: testUserId });
    expect(formatted.category).toBeNull();

    const categorizedRow: ListRow = {
      ...row,
      id: "categorized-1",
      category: "Fitness",
    };
    const formattedCat = await serializeListRow(db, categorizedRow, { viewerUserId: testUserId });
    expect(formattedCat.category).toBe("Fitness");
  });

  it("handleMigrateGuestLists preserves null/empty category as null in D1", async () => {
    const guestLists = [
      {
        name: "Guest Uncategorized",
        created_at: Date.now(),
        category: null,
        todos: [{ text: "Buy eggs", completed: false }],
      },
      {
        name: "Guest Movies",
        created_at: Date.now(),
        category: "Movies",
        todos: [{ text: "Inception", completed: true }],
      },
    ];

    const formData = new FormData();
    formData.append("guestLists", JSON.stringify(guestLists));

    await handleMigrateGuestLists(makeCtx(formData));

    const rows = await db
      .prepare("SELECT name, category FROM lists WHERE owner_id = ? ORDER BY name ASC")
      .bind(testUserId)
      .all<{ name: string; category: string | null }>();

    expect(rows.results).toHaveLength(2);
    const movies = rows.results.find((r) => r.name === "Guest Movies");
    const uncat = rows.results.find((r) => r.name === "Guest Uncategorized");

    expect(movies?.category).toBe("Movies");
    expect(uncat?.category).toBeNull();
  });
});
