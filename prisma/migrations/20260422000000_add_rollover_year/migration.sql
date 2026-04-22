-- Adds LeaveBalance.rolloverYear used by /api/cron/leave-rollover for idempotency.
--
-- Policy encoded by this column (see /api/cron/leave-rollover/route.ts):
--   * KST Jan 1 (with a Jan 1-7 safety window), for each member where
--     rolloverYear < currentKstYear and member.deletedAt IS NULL:
--       - baseDays >= 15 -> baseDays + 1 ; else baseDays := 15
--       - bonusDays := 0  (admin-granted bonus does NOT carry over; reissue
--                          manually via the admin page if needed)
--       - usedDays  := 0  (per-year usage resets; LeaveRequest history remains)
--       - rolloverYear := currentKstYear
--
-- Drift policy: the DEFAULT expression below is ONLY used to backfill existing
-- rows during ADD COLUMN. It is dropped immediately after so the Prisma schema
-- (which has no @default) matches the DB. All future inserts must supply the
-- value explicitly from application code.
--
-- Apply against prod DB (one-time):
--   psql "$DATABASE_URL" -f prisma/migrations/20260422000000_add_rollover_year/migration.sql
-- or:
--   pnpm prisma db execute --file prisma/migrations/20260422000000_add_rollover_year/migration.sql --url "$DATABASE_URL"
-- After apply:
--   pnpm prisma generate
ALTER TABLE "leave_balances"
  ADD COLUMN "rollover_year" INTEGER NOT NULL
  DEFAULT (EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Seoul')))::int;

ALTER TABLE "leave_balances"
  ALTER COLUMN "rollover_year" DROP DEFAULT;
