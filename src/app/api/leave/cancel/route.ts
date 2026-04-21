import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { formatKST, todayKST } from '@/lib/time';

const Body = z.object({ id: z.coerce.number().int() });

const TYPE_LABEL: Record<string, string> = {
  FULL_DAY: '연차',
  HALF_DAY_AM: '오전 반차',
  HALF_DAY_PM: '오후 반차',
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
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
    if (target.memberId !== session.memberId) {
      return NextResponse.json({ ok: false, error: '본인 신청만 취소할 수 있습니다' }, { status: 403 });
    }
    if (target.status !== 'REQUESTED' && target.status !== 'APPROVED') {
      return NextResponse.json(
        { ok: false, error: '이미 취소되었거나 처리된 신청입니다' },
        { status: 400 },
      );
    }
    if (target.startDate < todayKST()) {
      return NextResponse.json(
        { ok: false, error: '이미 시작된 연차는 취소할 수 없습니다' },
        { status: 400 },
      );
    }

    const previousStatus = target.status;
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: target.id },
        data: { status: 'CANCELLED' },
      });
      if (previousStatus === 'APPROVED') {
        await tx.leaveBalance.update({
          where: { memberId: target.memberId },
          data: { usedDays: { decrement: target.days } },
        });
      }
    });

    await logAudit({
      actorId: session.memberId,
      action: 'LEAVE_CANCEL',
      target: String(target.id),
      metadata: { previousStatus, days: Number(target.days) },
    });

    const [requester, admins] = await Promise.all([
      prisma.member.findUnique({ where: { id: session.memberId } }),
      prisma.member.findMany({ where: { role: 'ADMIN', deletedAt: null } }),
    ]);
    const dateRange =
      formatKST(target.startDate, 'yyyy-MM-dd') === formatKST(target.endDate, 'yyyy-MM-dd')
        ? formatKST(target.startDate, 'yyyy-MM-dd')
        : `${formatKST(target.startDate, 'yyyy-MM-dd')}~${formatKST(target.endDate, 'yyyy-MM-dd')}`;
    const typeLabel = TYPE_LABEL[target.type] ?? '연차';
    await Promise.all(
      admins.map((a) =>
        sendDm(
          a.slackId,
          `${requester?.name ?? '직원'}님이 ${dateRange} ${typeLabel} 신청을 취소했습니다.`,
        ).catch((err) =>
          logAudit({
            actorId: session.memberId,
            action: 'SLACK_SEND_FAIL',
            metadata: { stage: 'leave_cancel_notify_admin', error: String(err) },
          }),
        ),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
