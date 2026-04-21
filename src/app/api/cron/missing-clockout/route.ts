import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST, formatKST } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';
import { getAppSettings } from '@/lib/settings';
import { sendDm } from '@/lib/slack';
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
  const dateStr = formatKST(date, 'yyyy-MM-dd');
  const holidays = await getHolidaySet(dateStr, dateStr);
  if (holidays.has(dateStr)) {
    return NextResponse.json({ ok: true, skipped: 'holiday' });
  }

  const settings = await getAppSettings();

  // Leave excusing this afternoon, a full day or an afternoon half day. Nobody on it is chased.
  const afternoonOffLeaves = await prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      type: { in: ['FULL_DAY', 'HALF_DAY_PM'] },
      startDate: { lte: date },
      endDate: { gte: date },
      deletedAt: null,
    },
    select: { memberId: true },
  });
  const exemptMemberIds = new Set(afternoonOffLeaves.map((l) => l.memberId));

  // People who clocked in today and have not clocked out, with a session still open
  const pending = await prisma.attendance.findMany({
    where: {
      workDate: date,
      deletedAt: null,
      member: { deletedAt: null },
      sessions: { some: { endAt: null, deletedAt: null } },
    },
    include: { member: true },
  });
  const targets = pending.filter((a) => !exemptMemberIds.has(a.memberId));

  let notified = 0;
  if (settings.missingClockOutNotifyEnabled) {
    for (const a of targets) {
      try {
        await sendDm(
          a.member.slackId,
          'There is no clock-out recorded yet. Please clock out',
        );
        notified++;
      } catch (err) {
        await logAudit({
          actorId: a.memberId,
          action: 'SLACK_SEND_FAIL',
          metadata: { stage: 'missing_clockout', error: String(err) },
        });
      }
    }
  }

  await logAudit({
    action: 'CRON_MISSING_CLOCKOUT',
    metadata: {
      notified,
      targets: targets.length,
      totalOpen: pending.length,
      exempted: exemptMemberIds.size,
      notifyEnabled: settings.missingClockOutNotifyEnabled,
    },
  });
  return NextResponse.json({
    ok: true,
    notified,
    targets: targets.length,
    totalOpen: pending.length,
    notifyEnabled: settings.missingClockOutNotifyEnabled,
  });
}
