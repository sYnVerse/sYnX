-- Migration number: 0006 	 2026-10-29
--
-- Ties task reminders to the signed-in user who created or set the reminder
-- rather than always routing notifications to the list owner. Legacy rows with
-- reminder_user_id IS NULL continue to fall back to lists.owner_id via COALESCE.

ALTER TABLE todos ADD COLUMN reminder_user_id TEXT;
