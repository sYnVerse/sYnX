import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import {
  DEFAULT_DISPLAY_NAME,
  resolveDisplayName,
  sanitizeDisplayNameInput,
  syncUserProfileOnSignIn,
  getDisplayNameForUser,
  ownerPayload,
  ensureUserProfileSchema,
} from "../app/user-profile.server";
import {
  recordSharedListAccess,
  removeSharedListAccess,
  listSharedWithMe,
} from "../app/shared-lists.server";
import { parseListScope, serializeListRow } from "../app/api-helpers.server";

describe("display name helpers", () => {
  it("uses a non-email default when unset", () => {
    expect(resolveDisplayName(null)).toBe(DEFAULT_DISPLAY_NAME);
    expect(resolveDisplayName("")).toBe(DEFAULT_DISPLAY_NAME);
    expect(resolveDisplayName("   ")).toBe(DEFAULT_DISPLAY_NAME);
    expect(DEFAULT_DISPLAY_NAME).not.toContain("@");
    expect(resolveDisplayName("Chris")).toBe("Chris");
  });

  it("sanitizes and truncates display name input", () => {
    expect(sanitizeDisplayNameInput("  Ada  ")).toBe("Ada");
    expect(sanitizeDisplayNameInput("")).toBeNull();
    expect(sanitizeDisplayNameInput("   ")).toBeNull();
    expect(sanitizeDisplayNameInput("x".repeat(100))?.length).toBe(64);
  });

  it("owner payload only exposes displayName", () => {
    const payload = ownerPayload("Chris");
    expect(payload).toEqual({ displayName: "Chris" });
    expect(Object.keys(payload)).toEqual(["displayName"]);
  });
});

describe("parseListScope", () => {
  it("defaults to mine and accepts shared/all", () => {
    expect(parseListScope(null)).toBe("mine");
    expect(parseListScope("mine")).toBe("mine");
    expect(parseListScope("shared")).toBe("shared");
    expect(parseListScope("all")).toBe("all");
    expect(parseListScope("nope")).toBe("mine");
  });
});

describe("user profile + shared list access (D1)", () => {
  let db: D1Database;
  const ownerId = "owner-abc";
  const viewerId = "viewer-xyz";
  const ownerEmail = "owner@example.com";

  beforeEach(async () => {
    db = env.DB;
    await db.exec(
      `
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        email TEXT,
        email_enabled INTEGER DEFAULT 0,
        sms_enabled INTEGER DEFAULT 0,
        phone_number TEXT DEFAULT '',
        discord_webhook_url TEXT DEFAULT '',
        phone_carrier TEXT DEFAULT '',
        display_name TEXT
      );
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expiration_ttl INTEGER,
        share_mode TEXT DEFAULT 'private',
        category TEXT DEFAULT 'Checklist'
      );
      CREATE TABLE IF NOT EXISTS shared_list_access (
        user_id TEXT NOT NULL,
        list_id TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, list_id)
      );
    `.replace(/\n/g, " ")
    );
    await ensureUserProfileSchema(db);
  });

  afterEach(async () => {
    await db.exec("DELETE FROM shared_list_access");
    await db.exec("DELETE FROM lists");
    await db.exec("DELETE FROM user_settings");
  });

  it("syncs email on sign-in without setting display_name from email", async () => {
    await syncUserProfileOnSignIn(db, ownerId, ownerEmail);
    const row = await db
      .prepare("SELECT email, display_name FROM user_settings WHERE user_id = ?")
      .bind(ownerId)
      .first<{ email: string; display_name: string | null }>();
    expect(row?.email).toBe(ownerEmail);
    expect(row?.display_name == null || row?.display_name === "").toBe(true);
    expect(await getDisplayNameForUser(db, ownerId)).toBe(DEFAULT_DISPLAY_NAME);
    expect(await getDisplayNameForUser(db, ownerId)).not.toContain("@");
  });

  it("serializes list owner without leaking email", async () => {
    await syncUserProfileOnSignIn(db, ownerId, ownerEmail);
    await db
      .prepare(
        "UPDATE user_settings SET display_name = ? WHERE user_id = ?"
      )
      .bind("Chris", ownerId)
      .run();
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("list-1", "Shared List", ownerId, Date.now(), "public_read")
      .run();

    const row = await db.prepare("SELECT * FROM lists WHERE id = ?").bind("list-1").first<any>();
    const serialized = await serializeListRow(db, row, { viewerUserId: viewerId });

    expect(serialized.owner).toEqual({ displayName: "Chris" });
    const json = JSON.stringify(serialized);
    expect(json).not.toContain(ownerEmail);
    expect(json).not.toContain("@example.com");
    expect(serialized).not.toHaveProperty("email");
    expect((serialized.owner as any).email).toBeUndefined();
  });

  it("records shared access and lists only still-public shared lists", async () => {
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("pub-1", "Public", ownerId, Date.now(), "public_edit")
      .run();
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("priv-1", "Was Public", ownerId, Date.now(), "public_read")
      .run();

    await recordSharedListAccess(db, viewerId, "pub-1", false);
    await recordSharedListAccess(db, viewerId, "priv-1", false);

    let shared = await listSharedWithMe(db, viewerId);
    expect(shared.map((r) => r.id).sort()).toEqual(["priv-1", "pub-1"]);

    // Going private drops the list from Shared with me for non-owners
    await db.prepare("UPDATE lists SET share_mode = ? WHERE id = ?").bind("private", "priv-1").run();
    shared = await listSharedWithMe(db, viewerId);
    expect(shared.map((r) => r.id)).toEqual(["pub-1"]);
    expect(shared.map((r) => r.id)).not.toContain("priv-1");
  });

  it("does not record access for the owner", async () => {
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("own-1", "Mine", ownerId, Date.now(), "public_edit")
      .run();
    await recordSharedListAccess(db, ownerId, "own-1", true);
    const shared = await listSharedWithMe(db, ownerId);
    expect(shared).toEqual([]);
  });

  it("removes a list from Shared with me without deleting the list", async () => {
    await db
      .prepare(
        "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("pub-2", "Keep Me", ownerId, Date.now(), "public_read")
      .run();
    await recordSharedListAccess(db, viewerId, "pub-2", false);
    expect((await listSharedWithMe(db, viewerId)).map((r) => r.id)).toContain("pub-2");

    await removeSharedListAccess(db, viewerId, "pub-2");
    expect((await listSharedWithMe(db, viewerId)).map((r) => r.id)).not.toContain("pub-2");

    const stillThere = await db.prepare("SELECT id FROM lists WHERE id = ?").bind("pub-2").first();
    expect(stillThere).toBeTruthy();
  });
});
