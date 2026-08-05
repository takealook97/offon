-- Meeting-room bookings. There is no approval step, so a booking is confirmed at once,
-- and cancelling flips the status while keeping the row. deleted_at is for admin cleanup only.
-- Overlaps are prevented in the application, by a half-open range query.

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RoomBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "meeting_rooms" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meeting_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_bookings" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "type" "MeetingType" NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "external_attendees" TEXT,
    "status" "RoomBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_booking_attendees" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_booking_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_rooms_name_key" ON "meeting_rooms"("name");

-- CreateIndex
CREATE INDEX "room_bookings_room_id_start_at_idx" ON "room_bookings"("room_id", "start_at");

-- CreateIndex
CREATE INDEX "room_bookings_member_id_start_at_idx" ON "room_bookings"("member_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "room_booking_attendees_booking_id_member_id_key" ON "room_booking_attendees"("booking_id", "member_id");

-- CreateIndex
CREATE INDEX "room_booking_attendees_member_id_idx" ON "room_booking_attendees"("member_id");

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "meeting_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_attendees" ADD CONSTRAINT "room_booking_attendees_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "room_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_attendees" ADD CONSTRAINT "room_booking_attendees_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One room to start with. The UI has no room picker and the client takes the first,
-- so without this row nothing can be booked. The seed script is run by hand, so this goes here.
-- Safe to run again.
INSERT INTO "meeting_rooms" ("name", "sort_order", "updated_at")
VALUES ('Rooms 1', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
