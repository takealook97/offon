import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { todayKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';

const LUNCH_MINUTES = 60;
const STANDARD_MINUTES = 480;

export async function POST() {
  try {
    const session = await requireSession();
    const date = todayKST();
    const existing = await prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: session.sub, workDate: date } },
    });
    if (!existing || !existing.clockInAt) {
      return NextResponse.json(
        { ok: false, error: 'There is no clock-in recorded' },
        { status: 400 },
      );
    }
    const clockOut = new Date();
    const rawMinutes = Math.floor((clockOut.getTime() - existing.clockInAt.getTime()) / 60000);
    const worked = Math.max(0, rawMinutes - LUNCH_MINUTES);
    const overtime = Math.max(0, worked - STANDARD_MINUTES);

    const record = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        clockOutAt: clockOut,
        workedMinutes: worked,
        overtimeMinutes: overtime,
        status: 'DONE',
      },
    });
    await logAudit({
      actorId: session.sub,
      action: 'CLOCK_OUT',
      target: record.id,
      metadata: { worked, overtime },
    });
    return NextResponse.json({ ok: true, attendance: record });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
