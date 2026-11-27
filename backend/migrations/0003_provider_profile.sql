-- Migration number: 0003 	 2026-10-28
--
-- Profile photo and a suggested display name from the sign-in provider
-- (Google, GitHub, Microsoft), read from sYnID's /userinfo endpoint.
-- Additive only: every column is nullable or has a default, so existing rows
-- and older app code keep working.
--
--   avatar_url                         provider photo (https: Google/GitHub image hosts, or
--                                      sYnID's own /avatar/<key> for Microsoft work photos)
--   suggested_display_name             provider name, offered to the user; never copied
--                                      into display_name unless they accept it
--   display_name_suggestion_dismissed  1 once the user says "No thanks"
--   provider_profile_synced_at         ms timestamp of the last /userinfo check

ALTER TABLE user_settings ADD COLUMN avatar_url TEXT;
ALTER TABLE user_settings ADD COLUMN suggested_display_name TEXT;
ALTER TABLE user_settings ADD COLUMN display_name_suggestion_dismissed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN provider_profile_synced_at INTEGER;
