import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { formatKST, todayKST } from '@/lib/time';

const Body = z.object({ id: z.coerce.number().int() });

const TYPE_LABEL: Record<string, string> = {
  FULL_DAY: 'Leave',
  HALF_DAY_AM: 'Morning half day',
  HALF_DAY_PM: 'Afternoon half day',
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'That input is not valid' }, { status: 400 });
    }

    const target = await prisma.leaveRequest.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: 'That leave request no longer exists' }, { status: 404 });
    }
    if (target.memberId !== session.memberId) {
      return NextResponse.json({ ok: false, error: 'You can only cancel your own requests' }, { status: 403 });
    }
    if (target.status !== 'REQUESTED' && target.status !== 'APPROVED') {
      return NextResponse.json(
        { ok: false, error: 'That request was already cancelled or handled' },
        { status: 400 },
      );
    }
    if (target.startDate < todayKST()) {
      return NextResponse.json(
        { ok: false, error: 'Leave that has already started cannot be cancelled' },
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
      prisma.member.findFirst({ where: { id: session.memberId, deletedAt: null } }),
      prisma.member.findMany({ where: { role: 'ADMIN', deletedAt: null } }),
    ]);
    const dateRange =
      formatKST(target.startDate, 'yyyy-MM-dd') === formatKST(target.endDate, 'yyyy-MM-dd')
        ? formatKST(target.startDate, 'yyyy-MM-dd')
        : `${formatKST(target.startDate, 'yyyy-MM-dd')}~${formatKST(target.endDate, 'yyyy-MM-dd')}`;
    const typeLabel = TYPE_LABEL[target.type] ?? 'Leave';
    await Promise.all(
      admins.map((a) =>
        sendDm(
          a.slackId,
          `${requester?.name ?? 'An employee'} cancelled their ${typeLabel} request for ${dateRange}.`,
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
