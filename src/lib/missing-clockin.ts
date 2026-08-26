import { prisma } from './prisma';
import { zonedToday, isWeekday, formatZoned } from './time';
import { getHolidaySet } from './holidays';
import { logAudit } from './audit';
import { getAppSettings } from './settings';
import { sendDm } from './slack';
import { getDeploymentT } from './i18n/deployment';

export type MissingClockInResult =
  | { ok: true; skipped: 'weekend' | 'holiday' }
  | { ok: true; flagged: number; notified: number; notifyEnabled: boolean };

/**
 * Flags anyone with no clock-in as MISSING and, if the reminder is on, sends them a DM.
 *
 * It lives here rather than in the route so it can be tested. Run wrong, it chases someone
 * who is on leave, or chases the same person several times a day.
 *
 * Flagging and sending are separate. The MISSING flag is written even with the reminder off,
 * so an admin can still find it on the calendar later, and a set `clockInReminderSentAt`
 * stops a second send, so running several times a day still produces one DM.
 */
export async function runMissingClockIn(): Promise<MissingClockInResult> {
  const t = getDeploymentT();
  if (!isWeekday()) return { ok: true, skipped: 'weekend' };

  const date = zonedToday();
  const dateStr = formatZoned(date, 'yyyy-MM-dd');
  const holidays = await getHolidaySet(dateStr, dateStr);
  if (holidays.has(dateStr)) {
    return { ok: true, skipped: 'holiday' };
  }

  const settings = await getAppSettings();
  const members = await prisma.member.findMany({
    where: { deletedAt: null, excludeMissingNotify: false },
    select: { id: true, slackId: true },
  });
  if (members.length === 0) {
    await logAudit({
      action: 'CRON_MISSING_CLOCKIN',
      metadata: {
        flagged: 0,
        notified: 0,
        notifyEnabled: settings.missingClockInNotifyEnabled,
        totalActive: 0,
      },
    });
    return { ok: true, flagged: 0, notified: 0, notifyEnabled: settings.missingClockInNotifyEnabled };
  }

  const memberIds = members.map((m) => m.id);

  // Today's attendance rows, in one query
  const attendances = await prisma.attendance.findMany({
    where: { workDate: date, memberId: { in: memberIds }, deletedAt: null },
  });
  const attByMember = new Map(attendances.map((a) => [a.memberId, a]));

  // Leave excusing the morning — a full day or a morning half day — in one query
  const morningOffRows = await prisma.leaveRequest.findMany({
    where: {
      memberId: { in: memberIds },
      status: 'APPROVED',
      type: { in: ['FULL_DAY', 'HALF_DAY_AM'] },
      startDate: { lte: date },
      endDate: { gte: date },
      deletedAt: null,
    },
    select: { memberId: true },
  });
  const morningOffIds = new Set(morningOffRows.map((l) => l.memberId));

  let flagged = 0;
  let notified = 0;
  for (const m of members) {
    if (morningOffIds.has(m.id)) continue;
    const att = attByMember.get(m.id);
    if (att?.clockInAt) continue;

    const upserted = await prisma.attendance.upsert({
      where: { memberId_workDate: { memberId: m.id, workDate: date } },
      create: { memberId: m.id, workDate: date, status: 'MISSING' },
      update: { status: 'MISSING' },
    });
    flagged++;

    // Already reminded today, so skip. This is what makes repeated runs safe.
    if (upserted.clockInReminderSentAt) continue;
    if (!settings.missingClockInNotifyEnabled) continue;

    try {
      await sendDm(m.slackId, t('cron.missingClockIn'));
      await prisma.attendance.update({
        where: { id: upserted.id },
        data: { clockInReminderSentAt: new Date() },
      });
      notified++;
    } catch (err) {
      await logAudit({
        actorId: m.id,
        action: 'SLACK_SEND_FAIL',
        metadata: { stage: 'missing_clockin', error: String(err) },
      });
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
  return { ok: true, flagged, notified, notifyEnabled: settings.missingClockInNotifyEnabled };
}
