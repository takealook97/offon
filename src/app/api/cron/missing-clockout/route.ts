import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST, formatKST } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';
import { getAppSettings } from '@/lib/settings';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { checkCronAuth } from '@/lib/cron-auth';

export async function GET(req: NextRequest) {
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

  // 오늘 오후 근무 면제 연차(종일/오후 반차) — 이들은 퇴근 알림 대상에서 제외
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

  // 오늘 출근했고 아직 퇴근하지 않은(열린 세션이 있는) + reminder 미발송 멤버
  const pending = await prisma.attendance.findMany({
    where: {
      workDate: date,
      deletedAt: null,
      clockOutReminderSentAt: null,
      member: { deletedAt: null, excludeMissingNotify: false },
      sessions: { some: { endAt: null, deletedAt: null } },
    },
    include: { member: { select: { id: true, slackId: true } } },
  });
  const targets = pending.filter((a) => !exemptMemberIds.has(a.memberId));

  let notified = 0;
  if (settings.missingClockOutNotifyEnabled) {
    for (const a of targets) {
      try {
        await sendDm(
          a.member.slackId,
          '오후 7시 기준 퇴근 기록이 없습니다. 퇴근 처리 부탁드립니다',
        );
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
