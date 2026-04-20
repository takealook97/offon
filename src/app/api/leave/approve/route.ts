import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { formatKST } from '@/lib/time';

const Body = z.object({ id: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
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
    if (target.status !== 'REQUESTED') {
      return NextResponse.json({ ok: false, error: 'That request was already handled' }, { status: 400 });
    }

    const requester = await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: target.id },
        data: { status: 'APPROVED', approverId: admin.sub },
      });
      await tx.leaveBalance.update({
        where: { memberId: target.memberId },
        data: { usedDays: { increment: target.days } },
      });
      return tx.member.findUnique({ where: { id: target.memberId } });
    });

    await logAudit({
      actorId: admin.sub,
      action: 'LEAVE_APPROVE',
      target: target.id,
      metadata: { memberId: target.memberId },
    });

    if (requester?.slackId) {
      await sendDm(
        requester.slackId,
        `${formatKST(target.startDate, 'yyyy-MM-dd')}~${formatKST(target.endDate, 'yyyy-MM-dd')} leave was approved`,
      ).catch((err) =>
        logAudit({
          actorId: admin.sub,
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
