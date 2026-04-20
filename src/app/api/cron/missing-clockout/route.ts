import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST } from '@/lib/time';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';

const THRESHOLD_MINUTES = 540;

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
  const now = Date.now();

  // Today's attendance, where a session is still open
  const pending = await prisma.attendance.findMany({
    where: {
      workDate: date,
      deletedAt: null,
      member: { deletedAt: null },
      sessions: { some: { endAt: null, deletedAt: null } },
    },
    include: {
      member: true,
      sessions: {
        where: { endAt: null, deletedAt: null },
        orderBy: { startAt: 'asc' },
        take: 1,
      },
    },
  });

  // Only those that have been running past the threshold
  // TODO: a DM based on accumulated weekly or monthly overtime needs its own policy
  const longRunning = pending.filter((a) => {
    const open = a.sessions[0];
    if (!open) return false;
    return now - open.startAt.getTime() >= THRESHOLD_MINUTES * 60 * 1000;
  });

  let notified = 0;
  for (const a of longRunning) {
    try {
      await sendDm(
        a.member.slackId,
        'You have been clocked in for a long time. Please check whether you meant to clock out',
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

  await logAudit({
    action: 'CRON_MISSING_CLOCKOUT',
    metadata: {
      notified,
      longRunning: longRunning.length,
      totalOpen: pending.length,
      thresholdMinutes: THRESHOLD_MINUTES,
    },
  });
  return NextResponse.json({
    ok: true,
    notified,
    longRunning: longRunning.length,
    totalOpen: pending.length,
  });
}
