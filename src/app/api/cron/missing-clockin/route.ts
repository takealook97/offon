import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';

function authorized(req: NextRequest) {
  const header = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return header === expected;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isWeekdayKST()) return NextResponse.json({ ok: true, skipped: 'weekend' });

  const date = todayKST();
  const members = await prisma.member.findMany({
    where: { deletedAt: null },
  });

  let flagged = 0;
  for (const m of members) {
    const att = await prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: m.id, workDate: date } },
    });
    if (att?.clockInAt) continue;

    const approvedLeave = await prisma.leaveRequest.findFirst({
      where: {
        memberId: m.id,
        status: 'APPROVED',
        startDate: { lte: date },
        endDate: { gte: date },
        deletedAt: null,
      },
    });
    if (approvedLeave) continue;

    await prisma.attendance.upsert({
      where: { memberId_workDate: { memberId: m.id, workDate: date } },
      create: { memberId: m.id, workDate: date, status: 'MISSING' },
      update: { status: 'MISSING' },
    });

    // The missing clock-in DM is switched off for now. The record is still flagged.
    // try {
    //   await sendDm(m.slackId, t('dm.missingClockIn'));
    // } catch (err) {
    //   await logAudit({
    //     actorId: m.id,
    //     action: 'SLACK_SEND_FAIL',
    //     metadata: { stage: 'missing_clockin', error: String(err) },
    //   });
    // }
    flagged++;
  }

  await logAudit({
    action: 'CRON_MISSING_CLOCKIN',
    metadata: { flagged, totalActive: members.length },
  });
  return NextResponse.json({ ok: true, flagged });
}
