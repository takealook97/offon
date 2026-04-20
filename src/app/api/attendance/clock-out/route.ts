import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const STANDARD_MINUTES = 480;

export async function POST() {
  try {
    const session = await requireSession();

    const open = await prisma.attendanceSession.findFirst({
      where: {
        endAt: null,
        deletedAt: null,
        attendance: { memberId: session.memberId, deletedAt: null },
      },
      orderBy: { startAt: 'desc' },
      include: { attendance: true },
    });
    if (!open) {
      return NextResponse.json(
        { ok: false, error: 'No work session is open' },
        { status: 400 },
      );
    }

    const clockOut = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      await tx.attendanceSession.update({
        where: { id: open.id },
        data: { endAt: clockOut },
      });
      const all = await tx.attendanceSession.findMany({
        where: { attendanceId: open.attendanceId, deletedAt: null },
        select: { startAt: true, endAt: true },
      });
      const closed = all.filter((s) => s.endAt);
      const worked = closed.reduce(
        (sum, s) => sum + Math.floor((s.endAt!.getTime() - s.startAt.getTime()) / 60000),
        0,
      );
      const overtime = Math.max(0, worked - STANDARD_MINUTES);
      const minStart = all.reduce<Date | null>(
        (min, s) => (min === null || s.startAt < min ? s.startAt : min),
        null,
      );
      const maxEnd = closed.reduce<Date | null>(
        (max, s) => (max === null || s.endAt! > max ? s.endAt! : max),
        null,
      );
      return tx.attendance.update({
        where: { id: open.attendanceId },
        data: {
          clockInAt: minStart ?? open.attendance.clockInAt,
          clockOutAt: maxEnd,
          workedMinutes: worked,
          overtimeMinutes: overtime,
          status: 'DONE',
        },
      });
    });

    await logAudit({
      actorId: session.memberId,
      action: 'CLOCK_OUT',
      target: String(updated.id),
      metadata: { worked: updated.workedMinutes, overtime: updated.overtimeMinutes },
    });
    return NextResponse.json({ ok: true, attendance: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
