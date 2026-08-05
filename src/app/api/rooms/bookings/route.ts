import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { parseDate } from '@/lib/calendar-utils';
import { kstWallToUtc, utcToKstWall } from '@/lib/time';
import { RoomBookingBody, validateBookingRange } from '@/lib/room-booking';
import {
  allMembersActive,
  bookingInclude,
  findRoomConflict,
  toBookingDTO,
} from '@/lib/room-booking-server';

/** The default span when no range is given: one week grid, plus a little slack. */
const DEFAULT_RANGE_DAYS = 14;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const start =
      parseDate(searchParams.get('start')) ??
      new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    const end =
      parseDate(searchParams.get('end')) ??
      new Date(start.getTime() + DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

    const [rooms, bookings] = await Promise.all([
      prisma.meetingRoom.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      }),
      prisma.roomBooking.findMany({
        where: {
          status: 'CONFIRMED',
          deletedAt: null,
          // A half-open intersection, so a booking straddling the edge of the range is still included.
          startAt: { lt: end },
          endAt: { gt: start },
        },
        orderBy: { startAt: 'asc' },
        include: bookingInclude,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      rooms,
      bookings: bookings.map((b) => toBookingDTO(b, session)),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = RoomBookingBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? 'That input is not valid',
        },
        { status: 400 },
      );
    }
    const { roomId, type, title, start, end, memberIds, externalAttendees } =
      parsed.data;

    const check = validateBookingRange(start, end, utcToKstWall(new Date()));
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    }

    const room = await prisma.meetingRoom.findFirst({
      where: { id: roomId, deletedAt: null },
      select: { id: true },
    });
    if (!room) {
      return NextResponse.json(
        { ok: false, error: 'That room no longer exists' },
        { status: 404 },
      );
    }

    const uniqueMemberIds = [...new Set(memberIds)];
    if (!(await allMembersActive(uniqueMemberIds))) {
      return NextResponse.json(
        { ok: false, error: 'One of the attendees is not a valid member' },
        { status: 400 },
      );
    }

    const startAt = kstWallToUtc(start);
    const endAt = kstWallToUtc(end);

    const conflict = await findRoomConflict(roomId, startAt, endAt);
    if (conflict) {
      return NextResponse.json({ ok: false, error: conflict }, { status: 409 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const booking = await tx.roomBooking.create({
        data: {
          roomId,
          memberId: session.memberId,
          type,
          title,
          startAt,
          endAt,
          externalAttendees: externalAttendees || null,
        },
        select: { id: true },
      });
      if (uniqueMemberIds.length > 0) {
        await tx.roomBookingAttendee.createMany({
          data: uniqueMemberIds.map((memberId) => ({
            bookingId: booking.id,
            memberId,
          })),
        });
      }
      return booking;
    });

    await logAudit({
      actorId: session.memberId,
      action: 'ROOM_BOOKING_CREATE',
      target: String(created.id),
      metadata: { roomId, type, title, start, end, memberIds: uniqueMemberIds },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
