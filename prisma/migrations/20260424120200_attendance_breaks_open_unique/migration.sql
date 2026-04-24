-- Enforces at most one open break per session, in the database itself.
--
-- The same pattern as the open-session index:
-- the check in the application races under concurrent requests, whether a retry,
-- a double-click or two tabs. Both read no open break and both insert.
-- This partial unique index fails the second insert.
-- Starting a break catches that and maps it to an already-away answer.
--
-- The Prisma DSL cannot express a WHERE clause on a unique, so this is raw SQL.
--
-- Pre-flight: confirm there are no duplicate open breaks. On a new table there are none.
--   SELECT session_id, COUNT(*)
--     FROM attendance_breaks
--    WHERE end_at IS NULL AND deleted_at IS NULL
--    GROUP BY session_id
--   HAVING COUNT(*) > 1;
--
-- Reversible: DROP INDEX "attendance_breaks_open_unique";
CREATE UNIQUE INDEX "attendance_breaks_open_unique"
  ON "attendance_breaks" ("session_id")
  WHERE "end_at" IS NULL AND "deleted_at" IS NULL;
