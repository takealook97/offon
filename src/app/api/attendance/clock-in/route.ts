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
    const record = await prisma.attendance.upsert({
      where: { memberId_workDate: { memberId: session.memberId, workDate: date } },
      create: {
        memberId: session.memberId,
        workDate: date,
        clockInAt: now,
        status: 'WORKING',
      },
      update: {
        clockInAt: now,
        status: 'WORKING',
      },
    });
    await logAudit({ actorId: session.memberId, action: 'CLOCK_IN', target: String(record.id) });
    return NextResponse.json({ ok: true, attendance: record });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
