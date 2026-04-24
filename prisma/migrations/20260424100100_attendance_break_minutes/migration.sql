-- attendances.break_minutes: the total minutes away in a day.
-- Clocking out computes it from the session span less the worked minutes.
-- Existing rows start at zero: the old automatic lunch deduction is already
-- reflected in their worked minutes, and nothing is recomputed retroactively.
--
-- Reversible: ALTER TABLE "attendances" DROP COLUMN "break_minutes";
ALTER TABLE "attendances"
  ADD COLUMN "break_minutes" INTEGER NOT NULL DEFAULT 0;
