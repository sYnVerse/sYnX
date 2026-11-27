-- Migration number: 0004 	 2026-10-30
--
-- Pending delete requests on collaborative (public_edit) lists. Non-owners
-- cannot delete tasks, clear completed tasks, or delete the list directly;
-- they create a row here and the list owner approves or declines it.
--
-- target_type:
--   task            — delete one todo (target_id = todos.id)
--   list            — delete the whole list (target_id = '')
--   clear_completed — clear completed tasks on the list (target_id = '')
--
-- UNIQUE(list_id, target_type, target_id) avoids duplicate pending requests
-- for the same item. Empty string is used instead of NULL for list /
-- clear_completed so the unique constraint works in SQLite.

CREATE TABLE IF NOT EXISTS pending_delete_requests (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE,
  UNIQUE(list_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_delete_requests_list_id
  ON pending_delete_requests(list_id);

CREATE INDEX IF NOT EXISTS idx_pending_delete_requests_requester_id
  ON pending_delete_requests(requester_id);
