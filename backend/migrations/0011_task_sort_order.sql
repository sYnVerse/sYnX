ALTER TABLE todos ADD COLUMN sort_order INTEGER;

UPDATE todos
SET sort_order = (
  SELECT COUNT(*)
  FROM todos AS other
  WHERE other.list_id = todos.list_id
    AND (
      (todos.parent_id IS NULL AND other.parent_id IS NULL)
      OR other.parent_id = todos.parent_id
    )
    AND (
      other.created_at > todos.created_at
      OR (other.created_at = todos.created_at AND other.id < todos.id)
    )
)
WHERE sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_list_parent_sort
  ON todos(list_id, parent_id, sort_order, created_at DESC);
