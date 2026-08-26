-- Clears out what the lunch reminder left behind.
--
-- Once a meal was given a fixed end at the moment it starts, and returned on its own,
-- there was no longer any reason to ask whether someone was still at lunch. The handler went then, but the column
-- and the settings flag stayed, with nothing reading them and nothing writing them.
--
-- Not reversible. The values left are the last trace of a feature that no longer exists.
ALTER TABLE "app_settings" DROP COLUMN IF EXISTS "lunch_reminder_notify_enabled";
ALTER TABLE "attendances"  DROP COLUMN IF EXISTS "lunch_reminder_sent_at";
