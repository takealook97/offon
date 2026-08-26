-- Moves the working hours into settings.
--
-- 09:00 to 18:00 was written out in three separate places: the half-day calendar times,
-- the daily overtime threshold, and the standard day and half-day credit in the export.
-- They derive from one another, but as separate constants, so changing one left the others out of step.
--
-- The defaults reproduce the current behaviour exactly, at 09:00 and 18:00:
--   standard day   = 1080 - 540 - 60 (the meal) = 480, the old constant
--   half-day credit = 480 / 2 = 240, the old constant
--   half-day split  = 540 + 240 = 780, or 13:00, the old hardcoded hour
-- So this migration changes nothing for an existing installation.

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "work_start_minutes" INTEGER NOT NULL DEFAULT 540,
  ADD COLUMN IF NOT EXISTS "work_end_minutes" INTEGER NOT NULL DEFAULT 1080;
