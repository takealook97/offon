import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST, formatKST } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';
import { getAppSettings } from '@/lib/settings';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { checkCronAuth } from '@/lib/cron-auth';
import { getDeploymentT } from '@/lib/i18n/deployment';

export async function GET(req: NextRequest) {
  const t = getDeploymentT();
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason },
      { status: auth.reason === 'misconfigured' ? 500 : 401 },
    );
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

  // People who clocked in today and have not clocked out — an open session or an active break — and have not been reminded yet.
  const pending = await prisma.attendance.findMany({
    where: {
      workDate: date,
      deletedAt: null,
      clockOutReminderSentAt: null,
      member: { deletedAt: null, excludeMissingNotify: false },
      OR: [
        { sessions: { some: { endAt: null, deletedAt: null } } },
        { status: 'ON_BREAK' },
      ],
    },
    include: { member: { select: { id: true, slackId: true } } },
  });
  const targets = pending.filter((a) => !exemptMemberIds.has(a.memberId));

  let notified = 0;
  if (settings.missingClockOutNotifyEnabled) {
    for (const a of targets) {
      try {
        const msg =
          a.status === 'ON_BREAK'
            ? t('cron.stillAway')
            : t('cron.missingClockOut');
        await sendDm(a.member.slackId, msg);
        await prisma.attendance.update({
          where: { id: a.id },
          data: { clockOutReminderSentAt: new Date() },
        });
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
