-- Restores three partial unique indexes.
--
-- The Prisma DSL cannot express a partial index, so these three were always hand-written
-- SQL migrations. When the migration history was squashed into a single baseline, that
-- file was generated from the schema by `prisma migrate diff` -- and what is not in the
-- schema cannot be generated, so they vanished silently. An existing database still has
-- them, which is why nobody noticed; anyone installing fresh starts without them.
--
-- Without them, nothing stops a race between the app's own check and the database.
-- Pressing a button twice opens two breaks, and coming back closes only one, leaving the
-- person away for good. Two pending corrections can exist on one session, and approving
-- both has the second overwrite with a stale snapshot.
--
-- IF NOT EXISTS, because a database that came through the old history already has them.

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_sessions_open_unique"
  ON "attendance_sessions" ("attendance_id")
  WHERE "end_at" IS NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_breaks_open_unique"
  ON "attendance_breaks" ("session_id")
  WHERE "end_at" IS NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_edit_requests_pending_unique"
  ON "attendance_edit_requests" ("session_id")
  WHERE status = 'REQUESTED' AND deleted_at IS NULL;
