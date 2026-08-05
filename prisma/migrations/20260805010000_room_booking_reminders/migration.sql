-- The DM sent shortly before a meeting. Scheduled ahead through Slack rather than polled,
-- and pulled back by its stored id when a booking changes or is cancelled.
-- The same trick the meal return notice uses.
--
-- A booking has several recipients, which two columns cannot hold, so they get their own table.
-- These are pure link rows, so there is no soft delete; they cascade with the parent.
--
-- Reversible: DROP TABLE "room_booking_reminders";

-- CreateTable
CREATE TABLE "room_booking_reminders" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "channel_id" TEXT NOT NULL,
    "scheduled_message_id" TEXT NOT NULL,
    "post_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_booking_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_booking_reminders_booking_id_member_id_key" ON "room_booking_reminders"("booking_id", "member_id");

-- CreateIndex
CREATE INDEX "room_booking_reminders_booking_id_idx" ON "room_booking_reminders"("booking_id");

-- AddForeignKey
ALTER TABLE "room_booking_reminders" ADD CONSTRAINT "room_booking_reminders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "room_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_reminders" ADD CONSTRAINT "room_booking_reminders_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
