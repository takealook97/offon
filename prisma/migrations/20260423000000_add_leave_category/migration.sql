-- Adds LeaveRequest.category to distinguish ANNUAL / RESERVIST / CIVIL_DEFENSE.
--
-- Motivation: statutory public duty should not come out of the annual leave balance,
-- The existing approval, calendar and overlap workflow is reused unchanged.
-- The type axis says how much of the day; the category axis says what kind of leave.
--
-- Backfill: every existing record takes the default, annual.
--
-- Deploy order (prod):
--   1) Ship app code that reads/writes the new column (deployed first).
--      Default 'ANNUAL' keeps old code paths safe during the rolling deploy.
--   2) Apply this migration:
--        psql "$DATABASE_URL" -f prisma/migrations/20260423000000_add_leave_category/migration.sql
--      or:
--        pnpm prisma db execute --file prisma/migrations/20260423000000_add_leave_category/migration.sql --url "$DATABASE_URL"
--
-- Reversing this drops the column and the enum; existing RESERVIST/CIVIL_DEFENSE
-- records lose their classification. Roll back from a database backup.
CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'RESERVIST', 'CIVIL_DEFENSE');

ALTER TABLE "leave_requests"
  ADD COLUMN "category" "LeaveCategory" NOT NULL DEFAULT 'ANNUAL';
