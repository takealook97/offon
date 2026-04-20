import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayKST, isWeekdayKST } from '@/lib/time';
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

  const pending = await prisma.attendance.findMany({
    where: {
      workDate: date,
      clockInAt: { not: null },
      clockOutAt: null,
      deletedAt: null,
      member: { deletedAt: null },
    },
    include: { member: true },
  });

  let notified = 0;
  for (const a of pending) {
    try {
      await sendDm(
        a.member.slackId,
        '21시 기준 퇴근 기록이 없습니다. 퇴근 처리를 완료해 주세요',
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
    metadata: { notified, pending: pending.length },
  });
  return NextResponse.json({ ok: true, notified });
}
