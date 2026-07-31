CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  email_enabled INTEGER DEFAULT 0,
  sms_enabled INTEGER DEFAULT 0,
  phone_number TEXT DEFAULT '',
  discord_webhook_url TEXT DEFAULT '',
  phone_carrier TEXT DEFAULT ''
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
