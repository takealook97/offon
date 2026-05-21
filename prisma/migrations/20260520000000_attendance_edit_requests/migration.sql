-- CreateEnum
CREATE TYPE "AttendanceEditStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance_edit_requests" (
    "id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "attendance_id" INTEGER NOT NULL,
    "approver_id" INTEGER,
    "status" "AttendanceEditStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "reject_reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_edit_requests_member_id_status_idx" ON "attendance_edit_requests"("member_id", "status");

-- CreateIndex
CREATE INDEX "attendance_edit_requests_status_idx" ON "attendance_edit_requests"("status");

-- AddForeignKey
ALTER TABLE "attendance_edit_requests" ADD CONSTRAINT "attendance_edit_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_requests" ADD CONSTRAINT "attendance_edit_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_requests" ADD CONSTRAINT "attendance_edit_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
