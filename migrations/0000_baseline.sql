-- Migration number: 0000 	 2026-10-27
--
-- Baseline: the sYnX D1 schema exactly as it exists in production (synx-db)
-- on Oct 27, 2026, copied from production's sqlite_schema. Column order,
-- types, defaults and constraints match production, including columns that
-- were added over time with ALTER TABLE (they sit at the end of each table).
--
-- Every statement is CREATE TABLE IF NOT EXISTS, so on production, where all
-- five tables already exist, this migration changes nothing. Applying it there
-- only records it in the d1_migrations table. On a fresh database (local dev,
-- tests, a preview database) it creates the full schema.
--
-- Production has no indexes besides SQLite's automatic ones (from PRIMARY KEY
-- and UNIQUE), so none are created here. Add indexes in a new migration.
--
-- Never edit this file once it has been applied. Every schema change is a new
-- numbered migration (npx wrangler d1 migrations create synx-db <name>).
--
-- Tables are created in foreign key order: lists before todos and
-- shared_list_access.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  email_enabled INTEGER DEFAULT 0,
  sms_enabled INTEGER DEFAULT 0,
  phone_number TEXT DEFAULT '',
  discord_webhook_url TEXT DEFAULT '',
  phone_carrier TEXT DEFAULT '',
  display_name TEXT,
  time_zone TEXT
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

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  priority TEXT DEFAULT 'medium',
  reminder_at INTEGER,
  reminder_sent INTEGER DEFAULT 0,
  parent_id TEXT REFERENCES todos(id) ON DELETE CASCADE,
  recurrence TEXT DEFAULT 'none',
  duration_minutes INTEGER,
  FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
);

-- Signed-in users who opened a list they don't own ("Shared with me").
-- Rows for lists that later go private are filtered out at query time.
CREATE TABLE IF NOT EXISTS shared_list_access (
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id),
  FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
);

-- Push notification tokens for the mobile app (one row per device token).
CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
