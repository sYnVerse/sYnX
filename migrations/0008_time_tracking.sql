-- Migration number: 0008 	 2026-11-20T14:05:06.137Z
--
-- Time tracking: running task timers (todos.started_at / started_by) and an
-- append-only task_completions history table (retaining entries across Clear
-- Completed and task deletion, with op_id idempotency and 30-day void cleanup).

ALTER TABLE todos ADD COLUMN started_at INTEGER NULL;
ALTER TABLE todos ADD COLUMN started_by TEXT NULL;

CREATE TABLE task_completions (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  task_text TEXT NOT NULL,
  user_id TEXT NOT NULL,
  started_by TEXT NULL,
  started_at INTEGER NULL,
  completed_at INTEGER NOT NULL,
  duration_seconds INTEGER NULL,
  reminder_at INTEGER NULL,
  previous_reminder_sent INTEGER NULL,
  estimated_minutes INTEGER NULL,
  time_zone TEXT NULL,
  source TEXT NOT NULL,
  op_id TEXT UNIQUE,
  voided_at INTEGER NULL
);

CREATE INDEX idx_task_completions_todo_completed
  ON task_completions (todo_id, completed_at DESC);

CREATE INDEX idx_task_completions_user_completed
  ON task_completions (user_id, completed_at DESC);

CREATE INDEX idx_task_completions_list_completed
  ON task_completions (list_id, completed_at DESC);
