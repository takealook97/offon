import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST, formatKST } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';
import { logAudit } from '@/lib/audit';
import { getAppSettings } from '@/lib/settings';
import { sendDm } from '@/lib/slack';
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
    return NextResponse.json({ ok: true, flagged: 0, notified: 0 });
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
      await sendDm(m.slackId, 'No clock-in on record as of 10:00. Please take a look.');
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
  return NextResponse.json({
    ok: true,
    flagged,
    notified,
    notifyEnabled: settings.missingClockInNotifyEnabled,
  });
}
