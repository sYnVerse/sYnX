import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getListAccess } from "../app/api-helpers.server";
import { env } from "cloudflare:test";

describe("REST API Authorization & Share Modes", () => {
  let db: D1Database;
  const ownerId = "user-owner-123";
  const otherUserId = "user-other-456";

  beforeEach(async () => {
    db = env.DB;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM lists");
    await db.exec("DELETE FROM device_tokens");
  });

  it("grants full access to the list owner", async () => {
    const listId = "list-private-1";
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind(listId, "Private List", ownerId, Date.now(), "private")
      .run();

    const access = await getListAccess(db, listId, ownerId);
    expect(access.hasAccess).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.isOwner).toBe(true);
  });

  it("denies access to non-owners for a private list", async () => {
    const listId = "list-private-2";
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind(listId, "Private List", ownerId, Date.now(), "private")
      .run();

    const access = await getListAccess(db, listId, otherUserId);
    expect(access.hasAccess).toBe(false);
    expect(access.canEdit).toBe(false);
    expect(access.isOwner).toBe(false);
    expect(access.denial).toBe("private");
  });

  it("marks missing lists as not_found", async () => {
    const access = await getListAccess(db, "does-not-exist", otherUserId);
    expect(access.hasAccess).toBe(false);
    expect(access.list).toBeNull();
    expect(access.denial).toBe("not_found");
  });

  it("grants read-only access for public_read list to non-owners", async () => {
    const listId = "list-public-read";
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind(listId, "Public Read List", ownerId, Date.now(), "public_read")
      .run();

    const access = await getListAccess(db, listId, otherUserId);
    expect(access.hasAccess).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.isOwner).toBe(false);
  });

  it("grants read and edit access for public_edit list to non-owners", async () => {
    const listId = "list-public-edit";
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind(listId, "Public Edit List", ownerId, Date.now(), "public_edit")
      .run();

    const access = await getListAccess(db, listId, otherUserId);
    expect(access.hasAccess).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.isOwner).toBe(false);
  });

  it("does not treat other users' public lists as owned when querying by owner_id only", async () => {
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind("owned-list", "Mine", ownerId, Date.now(), "private")
      .run();
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind("public-other", "Someone Public", otherUserId, Date.now(), "public_edit")
      .run();

    const { results } = await db
      .prepare(`SELECT * FROM lists WHERE owner_id = ? ORDER BY created_at DESC`)
      .bind(ownerId)
      .all<any>();

    expect(results.map((r) => r.id)).toEqual(["owned-list"]);
    expect(results.map((r) => r.id)).not.toContain("public-other");
  });
});
