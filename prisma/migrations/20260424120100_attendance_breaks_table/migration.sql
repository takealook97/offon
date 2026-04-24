-- Creates the table that records a break as an entity of its own.
--
-- The old behaviour, where starting a break closed the session and coming back opened a new one,
-- stored a break inside a day and a return after clocking out in exactly the same shape,
-- so the gap between sessions was counted as time away.
--
-- This table records the break as its own row, leaving the session open.
-- Worked minutes are the sum of the sessions less the sum of the breaks.
-- The gap between sessions belongs to neither.
--
-- FK: attendance_id → attendances.id, session_id → attendance_sessions.id
-- Follows the shared timestamp columns and the soft-delete convention.
--
-- Reversible: DROP TABLE "attendance_breaks";
CREATE TABLE "attendance_breaks" (
  "id"            SERIAL      NOT NULL,
  "attendance_id" INTEGER     NOT NULL,
  "session_id"    INTEGER     NOT NULL,
  "start_at"      TIMESTAMP(3) NOT NULL,
  "end_at"        TIMESTAMP(3),
  "kind"          "BreakKind" NOT NULL DEFAULT 'BREAK',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  "deleted_at"    TIMESTAMP(3),

  CONSTRAINT "attendance_breaks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_breaks_attendance_id_idx"
  ON "attendance_breaks" ("attendance_id");

CREATE INDEX "attendance_breaks_session_id_idx"
  ON "attendance_breaks" ("session_id");

ALTER TABLE "attendance_breaks"
  ADD CONSTRAINT "attendance_breaks_attendance_id_fkey"
  FOREIGN KEY ("attendance_id") REFERENCES "attendances" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_breaks"
  ADD CONSTRAINT "attendance_breaks_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "attendance_sessions" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
