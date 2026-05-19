import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST, formatKST } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';
import { getAppSettings } from '@/lib/settings';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { checkCronAuth } from '@/lib/cron-auth';

// Sends a one-off DM once an open meal break has run past the threshold.
// Duplicates are prevented per break, by the column recording when it was sent.
// Not registered as a platform cron, which allows only one run a day. An external scheduler
// hits the endpoint every five minutes through the early afternoon.
const LUNCH_REMINDER_MS = 60 * 60 * 1000;
const MESSAGE = 'Your meal has been running for over an hour. Please come back.';

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
  if (!settings.lunchReminderNotifyEnabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - LUNCH_REMINDER_MS);

  // Open meal breaks past the threshold, not yet notified, belonging to an active member.
  const candidates = await prisma.attendanceBreak.findMany({
    where: {
      kind: 'LUNCH',
      endAt: null,
      deletedAt: null,
      lunchReminderSentAt: null,
      startAt: { lte: cutoff },
      attendance: {
        deletedAt: null,
        member: { deletedAt: null, excludeMissingNotify: false },
      },
    },
    select: {
      id: true,
      startAt: true,
      attendance: {
        select: {
          memberId: true,
          member: { select: { id: true, name: true, slackId: true } },
        },
      },
    },
  });

  const sentBreakIds: number[] = [];
  let skippedOutOfWindow = 0;

  for (const c of candidates) {
    // Only a break starting around midday counts as lunch.
    const startKstHour = Number(formatKST(c.startAt, 'H'));
    if (startKstHour < 11 || startKstHour >= 15) {
      skippedOutOfWindow++;
      continue;
    }

    try {
      await sendDm(c.attendance.member.slackId, MESSAGE);
    } catch (err) {
      // On failure the timestamp is left unset so the next run tries again.
      await logAudit({
        actorId: c.attendance.memberId,
        action: 'SLACK_SEND_FAIL',
        metadata: {
          stage: 'lunch_reminder',
          breakId: c.id,
          error: String(err),
        },
      });
      continue;
    }

    await prisma.attendanceBreak.update({
      where: { id: c.id },
      data: { lunchReminderSentAt: now },
    });

    await logAudit({
      actorId: c.attendance.memberId,
      action: 'LUNCH_REMINDER_SENT',
      target: String(c.id),
      metadata: {
        memberName: c.attendance.member.name,
        breakStartAt: c.startAt.toISOString(),
        elapsedMin: Math.floor((now.getTime() - c.startAt.getTime()) / 60000),
      },
    });
    sentBreakIds.push(c.id);
  }

  await logAudit({
    action: 'CRON_LUNCH_REMINDER',
    metadata: {
      sent: sentBreakIds.length,
      candidates: candidates.length,
      skippedOutOfWindow,
      notifyEnabled: settings.lunchReminderNotifyEnabled,
    },
  });

  return NextResponse.json({
    ok: true,
    sent: sentBreakIds.length,
    breakIds: sentBreakIds,
    candidates: candidates.length,
    skippedOutOfWindow,
    notifyEnabled: settings.lunchReminderNotifyEnabled,
  });
}
