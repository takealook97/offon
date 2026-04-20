import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { todayKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';

export async function POST() {
  try {
    const session = await requireSession();
    const now = new Date();
    const date = todayKST();

    const existing = await prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: session.memberId, workDate: date } },
    });

    if (existing) {
      const open = await prisma.attendanceSession.findFirst({
        where: { attendanceId: existing.id, endAt: null, deletedAt: null },
      });
      if (open) {
        return NextResponse.json(
          { ok: false, error: 'You are already clocked in' },
          { status: 400 },
        );
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.attendanceSession.create({
          data: { attendanceId: existing.id, startAt: now },
        });
        return tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: 'WORKING',
            clockOutAt: null,
            clockInAt: existing.clockInAt ?? now,
          },
        });
      });
      await logAudit({
        actorId: session.memberId,
        action: 'CLOCK_IN',
        target: String(updated.id),
        metadata: { reopen: true },
      });
      return NextResponse.json({ ok: true, attendance: updated });
    }

    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.attendance.create({
        data: {
          memberId: session.memberId,
          workDate: date,
          status: 'WORKING',
          clockInAt: now,
        },
      });
      await tx.attendanceSession.create({
        data: { attendanceId: a.id, startAt: now },
      });
      return a;
    });

    await logAudit({
      actorId: session.memberId,
      action: 'CLOCK_IN',
      target: String(created.id),
    });
    return NextResponse.json({ ok: true, attendance: created });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
