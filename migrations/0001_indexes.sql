-- Migration number: 0001 	 2026-10-28
--
-- Indexes for the queries sYnX runs most. Before this, production had only
-- SQLite's automatic indexes (primary keys and UNIQUE columns), so each of
-- these lookups scanned the whole table. Every index here matches a query in
-- the app; none changes what a query returns.
--
-- IF NOT EXISTS keeps this safe to re-run. The tables are small, so building
-- the indexes during the deploy takes moments.

-- Every page load and list API call loads todos by list
-- (WHERE list_id = ? / WHERE list_id IN (...)), and deleting a list cascades
-- to its todos through the list_id foreign key.
CREATE INDEX IF NOT EXISTS idx_todos_list_id ON todos(list_id);

-- Deleting a task cascades to its subtasks through the parent_id foreign key,
-- which looks up todos by parent_id.
CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos(parent_id);

-- The reminder cron runs every minute and looks for reminders that are due:
--   WHERE completed = 0 AND reminder_at IS NOT NULL
--     AND (reminder_sent IS NULL OR reminder_sent = 0) AND reminder_at <= ?
-- This partial index holds only those pending reminders (the WHERE below
-- repeats the query's conditions, which is what lets SQLite use it), so the
-- scan stays small no matter how many finished or reminder-less tasks exist.
CREATE INDEX IF NOT EXISTS idx_todos_pending_reminders ON todos(reminder_at)
  WHERE completed = 0 AND reminder_at IS NOT NULL AND (reminder_sent IS NULL OR reminder_sent = 0);

-- A user's own lists: WHERE owner_id = ? ORDER BY created_at, on every
-- signed-in page load and in the lists API. Including created_at also
-- covers the sort.
CREATE INDEX IF NOT EXISTS idx_lists_owner_created ON lists(owner_id, created_at);

-- Deleting a list cascades to shared_list_access through list_id. The
-- primary key (user_id, list_id) can't serve a lookup by list_id alone.
CREATE INDEX IF NOT EXISTS idx_shared_list_access_list_id ON shared_list_access(list_id);

-- The reminder cron loads each user's phones to send push notifications:
-- SELECT token FROM device_tokens WHERE user_id = ?
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
