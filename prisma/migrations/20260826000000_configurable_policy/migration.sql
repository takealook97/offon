-- Moves the meeting-room hours and the meal length from constants into admin settings.
-- The defaults match the old constants, so nothing changes for a deployment already running.
--
-- The meal length applies only to meals created from now on. A stored meal carries both its
-- start and its end, so it describes its own length and changing the setting leaves the past alone.
ALTER TABLE "app_settings"
  ADD COLUMN "room_open_minutes"  INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "room_close_minutes" INTEGER NOT NULL DEFAULT 1140,
  ADD COLUMN "meal_minutes"       INTEGER NOT NULL DEFAULT 60;
