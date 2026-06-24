import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { formatKST } from '@/lib/time';

const Body = z.object({ id: z.coerce.number().int(), reason: z.string().max(500).optional() });

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

    await prisma.leaveRequest.update({
      where: { id: target.id },
      data: { status: 'REJECTED', approverId: admin.memberId },
    });

    await logAudit({
      actorId: admin.memberId,
      action: 'LEAVE_REJECT',
      target: String(target.id),
      metadata: { memberId: target.memberId, reason: parsed.data.reason },
    });

    const requester = await prisma.member.findFirst({ where: { id: target.memberId, deletedAt: null } });
    if (requester?.slackId) {
      await sendDm(
        requester.slackId,
        `${formatKST(target.startDate, 'yyyy-MM-dd')}~${formatKST(target.endDate, 'yyyy-MM-dd')} leave was rejected${parsed.data.reason ? ` (reason: ${parsed.data.reason})` : ''}.`,
      ).catch((err) =>
        logAudit({
          actorId: admin.memberId,
          action: 'SLACK_SEND_FAIL',
          metadata: { stage: 'leave_reject_notify', error: String(err) },
        }),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
