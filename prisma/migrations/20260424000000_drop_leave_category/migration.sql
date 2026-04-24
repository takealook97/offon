-- Drops LeaveRequest.category column and LeaveCategory enum, after deleting
-- any remaining PUBLIC_DUTY rows.
--
-- Motivation: a UI policy rollback. The whole public-duty category is removed and
-- Rolls back to the single leave flow, before the public-duty category existed.
--
-- The two earlier migrations are kept as files, for the history:
--   20260423000000_add_leave_category
--   20260423010000_collapse_category_to_public_duty
--
-- Measured in production: three public-duty rows exist, two approved
-- and one rejected. In line with rolling the category back, the requests are hard-deleted too,
-- The used days are left alone; the approved ones never counted against the balance anyway,
-- so deleting them does not move any balance. The two people affected are told separately.
--
-- Deploy order (prod):
--   1) after deploying code that no longer reads the category field,
--   2) psql "$DATABASE_URL" -f prisma/migrations/20260424000000_drop_leave_category/migration.sql
--
-- Note: production has no migrations table, so the usual deploy path
-- is unsuitable. Run the SQL directly, or baseline the existing migrations
-- with `prisma migrate resolve --applied <name>` first.
DELETE FROM "leave_requests" WHERE "category" = 'PUBLIC_DUTY';

ALTER TABLE "leave_requests" DROP COLUMN "category";
DROP TYPE "LeaveCategory";
