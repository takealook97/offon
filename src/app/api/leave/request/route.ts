import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import {
  countBusinessDaysKST,
  isBusinessDayKSTDateStr,
  todayKST,
} from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';

const Body = z.object({
  type: z.enum(['FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const NON_BUSINESS_REJECT_MESSAGE = '주말·공휴일에는 연차를 신청할 수 없습니다';

function dayCount(
  start: string,
  end: string,
  type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM',
  holidays: ReadonlySet<string>,
) {
  if (type !== 'FULL_DAY') return new Prisma.Decimal(0.5);
  return new Prisma.Decimal(countBusinessDaysKST(start, end, holidays));
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: '입력이 올바르지 않습니다' }, { status: 400 });
    }
    const { type, startDate, endDate } = parsed.data;
    if (type !== 'FULL_DAY' && startDate !== endDate) {
      return NextResponse.json(
        { ok: false, error: '반차는 당일 범위로만 신청 가능합니다' },
        { status: 400 },
      );
    }
    const today = todayKST();
    if (new Date(startDate) < today) {
      return NextResponse.json(
        { ok: false, error: '과거 날짜는 신청할 수 없습니다' },
        { status: 400 },
      );
    }
    const holidays = await getHolidaySet(startDate, endDate);
    if (type !== 'FULL_DAY') {
      // 반차: 해당 날짜가 주말/공휴일이면 reject.
      if (!isBusinessDayKSTDateStr(startDate, holidays)) {
        return NextResponse.json(
          { ok: false, error: NON_BUSINESS_REJECT_MESSAGE },
          { status: 400 },
        );
      }
    } else {
      // FULL_DAY: 시작일/종료일 각각 비영업일이면 reject. 범위 내부는 자동 제외.
      if (!isBusinessDayKSTDateStr(startDate, holidays)) {
        return NextResponse.json(
          { ok: false, error: '시작일은 주말·공휴일로 지정할 수 없습니다' },
          { status: 400 },
        );
      }
      if (!isBusinessDayKSTDateStr(endDate, holidays)) {
        return NextResponse.json(
          { ok: false, error: '종료일은 주말·공휴일로 지정할 수 없습니다' },
          { status: 400 },
        );
      }
    }
    const days = dayCount(startDate, endDate, type, holidays);

    const [balance, pending] = await Promise.all([
      prisma.leaveBalance.findUnique({ where: { memberId: session.memberId } }),
      prisma.leaveRequest.aggregate({
        where: { memberId: session.memberId, status: 'REQUESTED', deletedAt: null },
        _sum: { days: true },
      }),
    ]);
    const base = balance ? Number(balance.baseDays) : 0;
    const bonus = balance ? Number(balance.bonusDays) : 0;
    const used = balance ? Number(balance.usedDays) : 0;
    const pendingDays = pending._sum.days ? Number(pending._sum.days) : 0;
    const available = base + bonus - used - pendingDays;
    if (Number(days) > available) {
      return NextResponse.json(
        { ok: false, error: `사용 가능 연차(${available}일)를 초과합니다` },
        { status: 400 },
      );
    }

    const record = await prisma.leaveRequest.create({
      data: {
        memberId: session.memberId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days,
        status: 'REQUESTED',
      },
    });

    await logAudit({
      actorId: session.memberId,
      action: 'LEAVE_REQUEST',
      target: String(record.id),
      metadata: { type, startDate, endDate },
    });

    const requester = await prisma.member.findUnique({ where: { id: session.memberId } });
    const admins = await prisma.member.findMany({
      where: { role: 'ADMIN', deletedAt: null },
    });
    const dateRange = startDate === endDate ? startDate : `${startDate}~${endDate}`;
    const action =
      type === 'FULL_DAY'
        ? '연차를 신청했습니다'
        : type === 'HALF_DAY_AM'
        ? '오전 반차를 신청했습니다'
        : '오후 반차를 신청했습니다';
    await Promise.all(
      admins.map((a) =>
        sendDm(
          a.slackId,
          `${requester?.name ?? '직원'}님이 ${dateRange} ${action}.`,
        ).catch((err) =>
          logAudit({
            actorId: session.memberId,
            action: 'SLACK_SEND_FAIL',
            metadata: { stage: 'leave_request_notify_admin', error: String(err) },
          }),
        ),
      ),
    );

    return NextResponse.json({ ok: true, leaveRequest: record });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
