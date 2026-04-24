-- Creates the enum naming what kind of break a break is.
--
-- Creating an enum and using it in DDL in the same transaction is safe in
-- Postgres, but the steps are split anyway, keeping the enum apart from the
-- table and the data changes.
--
-- Reversibility: DROP TYPE, but only once every column depending on it is gone.
CREATE TYPE "BreakKind" AS ENUM ('BREAK', 'LUNCH');
