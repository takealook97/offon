import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';
import { getAppSettings } from '@/lib/settings';
import { sendDm } from '@/lib/slack';

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
  const settings = await getAppSettings();
  const members = await prisma.member.findMany({
    where: { deletedAt: null },
  });

  let flagged = 0;
  let notified = 0;
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

    flagged++;

    if (settings.missingClockInNotifyEnabled) {
      try {
        await sendDm(
          m.slackId,
          '오전 10시 기준 출근 기록이 없습니다. 확인 부탁드립니다',
        );
        notified++;
      } catch (err) {
        await logAudit({
          actorId: m.id,
          action: 'SLACK_SEND_FAIL',
          metadata: { stage: 'missing_clockin', error: String(err) },
        });
      }
    }
  }

  await logAudit({
    action: 'CRON_MISSING_CLOCKIN',
    metadata: {
      flagged,
      notified,
      notifyEnabled: settings.missingClockInNotifyEnabled,
      totalActive: members.length,
    },
  });
  return NextResponse.json({
    ok: true,
    flagged,
    notified,
    notifyEnabled: settings.missingClockInNotifyEnabled,
  });
}
