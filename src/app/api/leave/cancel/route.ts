import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { todayKST } from '@/lib/time';
import { leaveTypeKey, formatLeaveDateRange } from '@/lib/leave-labels';
import { getT } from '@/lib/i18n/server';
import { getDeploymentT } from '@/lib/i18n/deployment';

const Body = z.object({ id: z.coerce.number().int() });

export async function POST(req: NextRequest) {
  const t = await getT();
  const dt = getDeploymentT();
  const weekdays = dt('weekday.short').split(',');
  try {
    const session = await requireSession();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: t('api.badInput') }, { status: 400 });
    }

    const target = await prisma.leaveRequest.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: t('api.leaveNotFound') }, { status: 404 });
    }
    if (target.memberId !== session.memberId) {
      return NextResponse.json({ ok: false, error: t('api.ownLeaveOnly') }, { status: 403 });
    }
    if (target.status !== 'REQUESTED' && target.status !== 'APPROVED') {
      return NextResponse.json(
        { ok: false, error: t('api.leaveCancelledAlready') },
        { status: 400 },
      );
    }
    if (target.startDate < todayKST()) {
      return NextResponse.json(
        { ok: false, error: t('api.leaveAlreadyStarted') },
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
    const dateRange = formatLeaveDateRange(target.startDate, target.endDate, weekdays);
    const typeLabel = dt(leaveTypeKey(target.type));
    await Promise.all(
      admins.map((a) =>
        sendDm(
          a.slackId,
          dt('dm.leaveCancelledLine', { name: requester?.name ?? dt('dm.employee'), range: dateRange, type: typeLabel }),
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
