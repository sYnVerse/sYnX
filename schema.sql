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

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  priority TEXT DEFAULT 'medium',
  reminder_at INTEGER,
  reminder_sent INTEGER DEFAULT 0,
  parent_id TEXT DEFAULT NULL,
  recurrence TEXT DEFAULT 'none',
  duration_minutes INTEGER DEFAULT NULL,
  FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES todos(id) ON DELETE CASCADE
);

-- Tracks signed-in users who opened a list they don't own (Shared with me).
-- Rows for lists that later go private are filtered out at query time.
CREATE TABLE IF NOT EXISTS shared_list_access (
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id),
  FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
);
