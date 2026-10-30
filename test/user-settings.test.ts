import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";

describe("User Settings Persistence Flow", () => {
  let db: D1Database;
  const userId = "user-123";
  const userEmail = "test@example.com";

  beforeEach(async () => {
    db = env.DB;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        email TEXT,
        email_enabled INTEGER DEFAULT 0,
        sms_enabled INTEGER DEFAULT 0,
        phone_number TEXT DEFAULT '',
        discord_webhook_url TEXT DEFAULT '',
        phone_carrier TEXT DEFAULT ''
      );
    `.replace(/\n/g, " "));
  });

  afterEach(async () => {
    await db.exec("DELETE FROM user_settings");
  });

  it("persists email_enabled settings across page refreshes and auto-syncs", async () => {
    // 1. Loader auto-sync on initial page visit
    await db.prepare(
      `INSERT INTO user_settings (user_id, email) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET email = excluded.email`
    ).bind(userId, userEmail).run();

    // Verify initial state
    let row = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).first<any>();
    expect(row.email_enabled).toBe(0);

    // 2. Logged-in user toggles email_enabled = 1 and saves preferences
    await db.prepare(
      `INSERT INTO user_settings (user_id, email, email_enabled, sms_enabled, phone_number, phone_carrier, discord_webhook_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         email_enabled = excluded.email_enabled,
         sms_enabled = excluded.sms_enabled,
         phone_number = excluded.phone_number,
         phone_carrier = excluded.phone_carrier,
         discord_webhook_url = excluded.discord_webhook_url`
    ).bind(userId, userEmail, 1, 0, "", "", "").run();

    row = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).first<any>();
    expect(row.email_enabled).toBe(1);

    // 3. User refreshes page (loader runs auto-sync again)
    await db.prepare(
      `INSERT INTO user_settings (user_id, email) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET email = excluded.email`
    ).bind(userId, userEmail).run();

    row = await db.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).first<any>();
    expect(row.email_enabled).toBe(1);
  });
});
