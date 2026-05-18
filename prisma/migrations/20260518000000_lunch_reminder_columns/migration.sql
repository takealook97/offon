-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "lunch_reminder_notify_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attendance_breaks" ADD COLUMN     "lunch_reminder_sent_at" TIMESTAMP(3);
