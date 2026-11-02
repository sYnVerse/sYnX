-- Migration number: 0007 	 2026-11-02
--
-- Records which signed-in user added each task, so a collaborator on a
-- Collaborative list can delete tasks they added without the owner's
-- approval. Existing rows keep created_by IS NULL and count as added by
-- someone else, so deleting them still needs a delete request.

ALTER TABLE todos ADD COLUMN created_by TEXT;
