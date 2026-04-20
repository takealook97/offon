import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { todayKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';

const STANDARD_MINUTES = 480;

export async function POST() {
  try {
    const session = await requireSession();
    const date = todayKST();
    const existing = await prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: session.memberId, workDate: date } },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'There is no clock-in recorded' },
        { status: 400 },
      );
    }

    const open = await prisma.attendanceSession.findFirst({
      where: { attendanceId: existing.id, endAt: null, deletedAt: null },
      orderBy: { startAt: 'desc' },
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
      const sessions = await tx.attendanceSession.findMany({
        where: {
          attendanceId: existing.id,
          deletedAt: null,
          endAt: { not: null },
        },
        select: { startAt: true, endAt: true },
      });
      const worked = sessions.reduce(
        (sum, s) => sum + Math.floor((s.endAt!.getTime() - s.startAt.getTime()) / 60000),
        0,
      );
      const overtime = Math.max(0, worked - STANDARD_MINUTES);
      return tx.attendance.update({
        where: { id: existing.id },
        data: {
          clockOutAt: clockOut,
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
