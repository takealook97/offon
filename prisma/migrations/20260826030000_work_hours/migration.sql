-- Moves the working hours into settings.
--
-- 09:00 to 18:00 was written out in three separate places: the times behind half-day
-- calendar events, the daily overtime threshold, and the standard day and half-day credit
-- in the Excel export. They derive from one another, but as separate constants, so
-- changing one left the others quietly out of step.
--
-- The defaults reproduce today's behaviour exactly:
--   standard day   = 1080 - 540 - 60 (the meal) = 480
--   half-day credit= 480 / 2                    = 240
--   half-day split = 540 + 240                  = 780, or 13:00
-- So this migration changes nothing for an existing installation.

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "work_start_minutes" INTEGER NOT NULL DEFAULT 540,
  ADD COLUMN IF NOT EXISTS "work_end_minutes" INTEGER NOT NULL DEFAULT 1080;
