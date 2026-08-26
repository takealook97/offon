import { prisma } from './prisma';
import { todayKey, zonedToday, isWeekday } from './time';
import { getHolidaySet } from './holidays';
import { getAppSettings } from './settings';
import { sendDm } from './slack';
import { logAudit } from './audit';
import { getDeploymentT } from './i18n/deployment';

export type MissingClockOutResult =
  | { ok: true; skipped: 'weekend' | 'holiday' }
  | { ok: true; notified: number; targets: number; totalOpen: number; notifyEnabled: boolean };

/**
 * DMs anyone who clocked in but has no clock-out.
 *
 * Unlike the missing clock-in, nothing is written here. Clocking out on someone's behalf would put
 * a time that never happened into their hours. This only tells them, and they correct it themselves.
 */
export async function runMissingClockOut(): Promise<MissingClockOutResult> {
  const t = getDeploymentT();
  if (!isWeekday()) return { ok: true, skipped: 'weekend' };

  const dateStr = todayKey();
  const date = zonedToday();
  const holidays = await getHolidaySet(dateStr, dateStr);
  if (holidays.has(dateStr)) {
    return { ok: true, skipped: 'holiday' };
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
  return {
    ok: true,
    notified,
    targets: targets.length,
    totalOpen: pending.length,
    notifyEnabled: settings.missingClockOutNotifyEnabled,
  };
}
