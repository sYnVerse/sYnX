-- Migration number: 0010 	 2026-11-27T02:19:13.874Z
CREATE TABLE list_archives (
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  archived_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE INDEX idx_list_archives_list_id ON list_archives (list_id);
CREATE INDEX idx_list_archives_user_archived_at ON list_archives (user_id, archived_at DESC);

ALTER TABLE user_settings ADD COLUMN archive_suggestions_enabled INTEGER NOT NULL DEFAULT 1;

