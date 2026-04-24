-- A one-off correction to the break minutes on a single 2026-04-24 attendance row.
--
-- Cause: the old break implementation counted the gap between clocking out
-- and returning later -- five hours and twenty-two minutes -- as time away.
-- In truth there was no break at all, only two separate sessions.
--
-- From this migration on, breaks are aggregated from their own table and the gap
-- between sessions can no longer pollute the figure. Past data is left out of any
-- recomputation; only this one row is corrected by hand.
--
-- Idempotent: only touches the row while it still holds the wrong value.
UPDATE "attendances"
   SET "break_minutes" = 0
 WHERE "id" = 48
   AND "member_id" = 4
   AND "break_minutes" = 322;
