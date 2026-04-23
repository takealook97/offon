-- Collapse LeaveCategory from ANNUAL/RESERVIST/CIVIL_DEFENSE to ANNUAL/PUBLIC_DUTY.
--
-- Motivation: a UI policy change treats the two kinds of public duty as one category
-- No rows carry the two older values, confirmed against the database right after the deploy. So
-- the whole enum is replaced.
--
-- Safety: measured against the data, every row carries the default. Dropping the column
-- and recreating it fills the default in automatically, so nothing is lost. If production
-- has gained rows carrying the older values since, running this loses that classification. Right after the deploy
-- Run it only inside that window.
ALTER TABLE "leave_requests" DROP COLUMN "category";
DROP TYPE "LeaveCategory";

CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'PUBLIC_DUTY');

ALTER TABLE "leave_requests"
  ADD COLUMN "category" "LeaveCategory" NOT NULL DEFAULT 'ANNUAL';
