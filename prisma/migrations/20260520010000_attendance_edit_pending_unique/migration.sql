-- At most one pending correction per session, which closes the gap between the check and the write.
-- The Prisma DSL cannot express a partial unique, so this is raw SQL.
CREATE UNIQUE INDEX "attendance_edit_requests_pending_unique"
  ON "attendance_edit_requests" ("session_id")
  WHERE status = 'REQUESTED' AND deleted_at IS NULL;
