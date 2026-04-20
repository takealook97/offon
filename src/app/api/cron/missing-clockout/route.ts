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

  // 열린 세션이 있는 오늘자 attendance 조회
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

  // 9시간 초과 진행 중인 것만 추출
  // TODO: 주/월 누적 초과근무 기준 DM은 별도 정책 필요
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
        '9시간 이상 근무가 진행 중입니다. 퇴근 처리를 확인해 주세요',
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
