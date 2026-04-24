-- Adds ON_BREAK to the attendance status enum so that a day can move explicitly
--   NOT_STARTED -> WORKING -> ON_BREAK -> WORKING -> DONE.
--
-- Postgres will not let a newly added enum value be used by DML in the same
-- transaction, so this migration only adds it. Code that actually writes the
-- value is safe from the commit after this one.
--
-- Reversibility: Postgres has no standard way to remove an enum value, so rolling back is not advised.
-- If you must, revert the code that uses it; the value stays.
ALTER TYPE "AttendanceStatus" ADD VALUE 'ON_BREAK';
