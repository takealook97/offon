import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { formatKST, countBusinessDaysKST } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';

const Body = z.object({ id: z.coerce.number().int() });

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: '입력이 올바르지 않습니다' }, { status: 400 });
    }

    const target = await prisma.leaveRequest.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: '연차 신청이 존재하지 않습니다' }, { status: 404 });
    }
    if (target.status !== 'REQUESTED') {
      return NextResponse.json({ ok: false, error: '이미 처리된 신청입니다' }, { status: 400 });
    }

    // 승인 시점의 공휴일 세트로 days를 재계산한다. 반차는 0.5 고정이나,
    // 반차 날짜가 새로 지정된 공휴일과 겹치면 승인 불가.
    const startStr = formatKST(target.startDate, 'yyyy-MM-dd');
    const endStr = formatKST(target.endDate, 'yyyy-MM-dd');
    const holidays = await getHolidaySet(startStr, endStr);
    let recomputedDays: Prisma.Decimal;
    if (target.type === 'FULL_DAY') {
      recomputedDays = new Prisma.Decimal(
        countBusinessDaysKST(startStr, endStr, holidays),
      );
    } else {
      recomputedDays = holidays.has(startStr)
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(0.5);
    }
    if (Number(recomputedDays) === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: '공휴일이 포함되어 유효한 연차 일수가 0입니다. 신청을 반려하고 다시 신청해야 합니다',
        },
        { status: 400 },
      );
    }

    const requester = await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: target.id },
        data: {
          status: 'APPROVED',
          approverId: admin.memberId,
          days: recomputedDays,
        },
      });
      await tx.leaveBalance.update({
        where: { memberId: target.memberId },
        data: { usedDays: { increment: recomputedDays } },
      });
      return tx.member.findUnique({ where: { id: target.memberId } });
    });

    await logAudit({
      actorId: admin.memberId,
      action: 'LEAVE_APPROVE',
      target: String(target.id),
      metadata: {
        memberId: target.memberId,
        originalDays: Number(target.days),
        approvedDays: Number(recomputedDays),
      },
    });

    if (requester?.slackId) {
      await sendDm(
        requester.slackId,
        `${formatKST(target.startDate, 'yyyy-MM-dd')}~${formatKST(target.endDate, 'yyyy-MM-dd')} 연차가 승인되었습니다`,
      ).catch((err) =>
        logAudit({
          actorId: admin.memberId,
          action: 'SLACK_SEND_FAIL',
          metadata: { stage: 'leave_approve_notify', error: String(err) },
        }),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
