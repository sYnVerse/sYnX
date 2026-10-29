-- Migration number: 0005 	 2026-10-30
--
-- Activity log for non-private (shared) lists. Records who changed what, from
-- where (IP / user agent), so owners can review misuse — especially by guests.
--
-- No foreign keys: rows for deleted tasks/lists are kept until the 90-day
-- retention cleanup removes them (list_deleted entries would otherwise vanish
-- immediately with ON DELETE CASCADE).
--
-- actor_type: owner | collaborator | guest
-- action:     task_created | task_edited | task_completed | task_uncompleted |
--             task_deleted | clear_completed | list_renamed |
--             list_settings_changed | list_deleted | delete_requested |
--             delete_approved | delete_declined

CREATE TABLE IF NOT EXISTS list_activity (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  task_id TEXT,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  summary TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_list_activity_list_created
  ON list_activity(list_id, created_at);

CREATE INDEX IF NOT EXISTS idx_list_activity_created
  ON list_activity(created_at);
