-- AlterTable
ALTER TABLE "attendance_breaks" ADD COLUMN     "auto_back_message_id" TEXT;

-- AlterTable
ALTER TABLE "attendance_breaks" ADD COLUMN     "auto_back_channel_id" TEXT;

-- Existing meal-tagged rows are not meals as a feature; they are ordinary breaks worded differently,
-- tagged by the time of day, and the old command
--  opened an ordinary break of any length.
-- The new meal feature reinterprets that tag as a fixed hour, so leaving them alone would
--   1) stretch a past twenty-minute break to an hour on the next correction, cutting worked time, and
--   2) leave corrections requested before the deploy permanently unapprovable.
-- In the old data the two meant the same thing, so all of them are normalised to ordinary breaks.
UPDATE "attendance_breaks" SET "kind" = 'BREAK' WHERE "kind" = 'LUNCH';
