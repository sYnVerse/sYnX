import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { TodoManager } from "../app/to-do-manager";
import { getUserTimeZone, setUserTimeZone } from "../app/user-profile.server";
import { nextReminderAt } from "../shared";

const LA = "America/Los_Angeles";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Local wall-clock string in a zone, independent of the runner's TZ. */
function wall(ms: number, timeZone = LA): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

describe("recurring reminders keep their local clock time across DST", () => {
  it("daily and weekly keep 9:00 AM across the Nov 1, 2026 fall-back; no zone keeps fixed 24h/7d", () => {
    const sat9am = Date.parse("2026-10-31T09:00:00-07:00"); // PDT
    const mon9am = Date.parse("2026-10-26T09:00:00-07:00"); // PDT

    const daily = nextReminderAt(sat9am, "daily", LA);
    expect(wall(daily)).toBe("Sun, Nov 1, 09:00");
    expect(daily - sat9am).toBe(25 * HOUR);

    const weekly = nextReminderAt(mon9am, "weekly", LA);
    expect(wall(weekly)).toBe("Mon, Nov 2, 09:00");
    expect(weekly - mon9am).toBe(7 * DAY + HOUR);

    // Older clients / unknown zone: unchanged fixed-interval behavior.
    expect(nextReminderAt(sat9am, "daily")).toBe(sat9am + DAY);
    expect(nextReminderAt(mon9am, "weekly", "Not/AZone")).toBe(mon9am + 7 * DAY);
  });

  it("weekly keeps 9:00 AM across the March 2027 spring-forward, and monthly clamps to month end", () => {
    const mon9am = Date.parse("2027-03-08T09:00:00-08:00"); // PST; clocks spring forward Mar 14
    const weekly = nextReminderAt(mon9am, "weekly", LA);
    expect(wall(weekly)).toBe("Mon, Mar 15, 09:00");
    expect(weekly - mon9am).toBe(7 * DAY - HOUR);

    const jan31 = Date.parse("2027-01-31T09:00:00-08:00");
    expect(wall(nextReminderAt(jan31, "monthly", LA))).toBe("Sun, Feb 28, 09:00");
  });
});

describe("server rescheduling uses the user's stored time zone", () => {
  const listId = "dst-list";
  const userId = "dst-user";
  let db: D1Database;

  beforeEach(async () => {
    db = env.DB;
    await db.exec(
      `
      CREATE TABLE IF NOT EXISTS user_settings ( user_id TEXT PRIMARY KEY, email TEXT, email_enabled INTEGER DEFAULT 0, sms_enabled INTEGER DEFAULT 0, phone_number TEXT DEFAULT '', discord_webhook_url TEXT DEFAULT '', phone_carrier TEXT DEFAULT '', display_name TEXT );
      CREATE TABLE IF NOT EXISTS lists ( id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL, expiration_ttl INTEGER, share_mode TEXT DEFAULT 'private' );
      CREATE TABLE IF NOT EXISTS todos ( id TEXT PRIMARY KEY, list_id TEXT NOT NULL, text TEXT NOT NULL, completed INTEGER DEFAULT 0, created_at INTEGER NOT NULL, priority TEXT DEFAULT 'medium', reminder_at INTEGER, reminder_sent INTEGER DEFAULT 0, parent_id TEXT DEFAULT NULL, recurrence TEXT DEFAULT 'none', duration_minutes INTEGER DEFAULT NULL );
    `.replace(/\n/g, " ")
    );
    await db
      .prepare("INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(listId, "DST", userId, Date.now())
      .run();
  });

  afterEach(async () => {
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
    await db.exec("DELETE FROM user_settings");
  });

  it("stores a valid reported zone (rejecting junk) and reschedules in it", async () => {
    expect(await getUserTimeZone(db, userId)).toBeUndefined();
    expect(await setUserTimeZone(db, userId, "a@example.com", "'; DROP TABLE todos; --")).toBe(false);
    expect(await setUserTimeZone(db, userId, "a@example.com", LA)).toBe(true);
    const timeZone = await getUserTimeZone(db, userId);
    expect(timeZone).toBe(LA);

    const manager = new TodoManager(db, listId);
    const mon9am = Date.parse("2026-10-26T09:00:00-07:00");
    const todo = await manager.create("Weekly sync", "none", mon9am, undefined, "weekly");
    const { todo: next, rescheduled } = await manager.setCompleted(todo.id, true, { timeZone });
    expect(rescheduled).toBe(true);
    expect(wall(next.reminderAt!)).toBe("Mon, Nov 2, 09:00");
  });
});
