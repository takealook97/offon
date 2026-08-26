import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { wallToUtc, utcToWall } from '@/lib/time';
import { RoomBookingPatchBody, validateBookingRange } from '@/lib/room-booking';
import {
  allMembersActive,
  cancelBookingReminders,
  findRoomConflict,
  scheduleBookingReminders,
} from '@/lib/room-booking-server';
import { getT } from '@/lib/i18n/server';
import { roomHours } from '@/lib/settings';

type Ctx = { params: Promise<{ id: string }> };

type GuardedBooking = { id: number; roomId: number; startAt: Date; endAt: Date };

type Guarded =
  | { ok: true; booking: GuardedBooking }
  | { ok: false; response: NextResponse };

/**
 * The guard shared by editing and cancelling: only the organiser or an admin gets through.
 * A booking that has already ended is locked. Adjusting a meeting still running is fair;
 * rewriting one that is over distorts the record.
 */
async function guardManage(
  idParam: string,
  viewer: { memberId: number; role: string },
): Promise<Guarded> {
  const t = await getT();
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: t('api.badRequest') }, { status: 400 }),
    };
  }
  const booking = await prisma.roomBooking.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      roomId: true,
      memberId: true,
      status: true,
      startAt: true,
      endAt: true,
    },
  });
  if (!booking) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: t('api.bookingNotFound') },
        { status: 404 },
      ),
    };
  }
  if (booking.status !== 'CONFIRMED') {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: t('api.bookingCancelled') },
        { status: 400 },
      ),
    };
  }
  if (booking.memberId !== viewer.memberId && viewer.role !== 'ADMIN') {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: t('api.ownBookingOnly') },
        { status: 403 },
      ),
    };
  }
  if (booking.endAt < new Date()) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: t('api.bookingEnded') },
        { status: 400 },
      ),
    };
  }
  return { ok: true, booking };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t = await getT();
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const guard = await guardManage(id, session);
    if (!guard.ok) return guard.response;
    const target = guard.booking;

    const parsed = RoomBookingPatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? t('api.badInput'),
        },
        { status: 400 },
      );
    }
    const { type, title, start, end, memberIds, externalAttendees } = parsed.data;

    const check = validateBookingRange(start, end, utcToWall(new Date()), await roomHours());
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: t(check.messageKey, check.vars) }, { status: 400 });
    }

    const uniqueMemberIds = [...new Set(memberIds)];
    if (!(await allMembersActive(uniqueMemberIds))) {
      return NextResponse.json(
        { ok: false, error: t('api.badAttendee') },
        { status: 400 },
      );
    }

    const startAt = wallToUtc(start);
    const endAt = wallToUtc(end);

    const conflict = await findRoomConflict(target.roomId, startAt, endAt, target.id);
    if (conflict) {
      return NextResponse.json({ ok: false, error: conflict }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.roomBooking.update({
        where: { id: target.id },
        data: {
          type,
          title,
          startAt,
          endAt,
          externalAttendees: externalAttendees || null,
        },
      });
      // Attendees are replaced wholesale rather than updated piecemeal. They are join rows with
      // no historical value, and this is simpler than working out the additions and removals.
      await tx.roomBookingAttendee.deleteMany({ where: { bookingId: target.id } });
      if (uniqueMemberIds.length > 0) {
        await tx.roomBookingAttendee.createMany({
          data: uniqueMemberIds.map((memberId) => ({ bookingId: target.id, memberId })),
        });
      }
    });

    await logAudit({
      actorId: session.memberId,
      action: 'ROOM_BOOKING_UPDATE',
      target: String(target.id),
      metadata: {
        before: {
          start: utcToWall(target.startAt),
          end: utcToWall(target.endAt),
        },
        after: { start, end },
        type,
        title,
        memberIds: uniqueMemberIds,
      },
    });

    // Both the time and the attendees may have changed, so the scheduled reminders are cleared and set again.
    await cancelBookingReminders(target.id);
    await scheduleBookingReminders(target.id);

    return NextResponse.json({ ok: true, id: target.id });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const guard = await guardManage(id, session);
    if (!guard.ok) return guard.response;
    const target = guard.booking;

    // Cancelling flips the status rather than deleting the row, the same convention leave requests follow.
    await prisma.roomBooking.update({
      where: { id: target.id },
      data: { status: 'CANCELLED' },
    });

    // Clears the scheduled messages so no reminder goes out for a meeting that was called off.
    await cancelBookingReminders(target.id);

    await logAudit({
      actorId: session.memberId,
      action: 'ROOM_BOOKING_CANCEL',
      target: String(target.id),
      metadata: {
        start: utcToWall(target.startAt),
        end: utcToWall(target.endAt),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
