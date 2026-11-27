-- Migration number: 0002 	 2026-10-28
--
-- One-time cleanup of lists that guests (people who aren't signed in) created
-- in D1. Guest lists now live only in the guest's browser, and the server no
-- longer lets guests create lists, so these rows are leftovers. They were
-- created with a 24-hour expiration_ttl, but nothing ever deleted them, and
-- the app never showed them to their guest again.
--
-- What this deletes, and nothing else:
--   * lists whose owner_id is a guest id: exactly "guest_" followed by a
--     36-character UUID (8-4-4-4-12 with dashes), the only shape the app
--     gives guests. Signed-in users' ids never look like this.
--   * the tasks (todos) in those lists
--   * "Shared with me" rows (shared_list_access) that point at those lists
--
-- In GLOB, "_" and "-" are literal and "?" matches exactly one character, so
-- the pattern can't match any other owner id.
--
-- Lists owned by signed-in users are never touched, including their shared
-- lists that guests added tasks to. Child rows go first so the cleanup
-- doesn't rely on foreign key cascades.

DELETE FROM shared_list_access
WHERE list_id IN (
  SELECT id FROM lists WHERE owner_id GLOB 'guest_????????-????-????-????-????????????'
);

DELETE FROM todos
WHERE list_id IN (
  SELECT id FROM lists WHERE owner_id GLOB 'guest_????????-????-????-????-????????????'
);

DELETE FROM lists
WHERE owner_id GLOB 'guest_????????-????-????-????-????????????';
