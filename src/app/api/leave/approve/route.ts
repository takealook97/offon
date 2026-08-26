import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { formatZoned, countBusinessDays } from '@/lib/time';
import { getHolidaySet } from '@/lib/holidays';
import { leaveTypeKey, formatLeaveDateRange } from '@/lib/leave-labels';
import { getT } from '@/lib/i18n/server';
import { getDeploymentT } from '@/lib/i18n/deployment';

const Body = z.object({ id: z.coerce.number().int() });

export async function POST(req: NextRequest) {
  const dt = getDeploymentT();
  const weekdays = dt('weekday.short').split(',');
  const t = await getT();
  try {
    const admin = await requireAdmin();
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
    if (target.status !== 'REQUESTED') {
      return NextResponse.json({ ok: false, error: t('api.leaveHandled') }, { status: 400 });
    }

    // The day count is recomputed against the holidays as they stand at approval. A half day is
    // a fixed 0.5, but it cannot be approved if its date has since become a holiday.
    const startStr = formatZoned(target.startDate, 'yyyy-MM-dd');
    const endStr = formatZoned(target.endDate, 'yyyy-MM-dd');
    const holidays = await getHolidaySet(startStr, endStr);
    let recomputedDays: Prisma.Decimal;
    if (target.type === 'FULL_DAY') {
      recomputedDays = new Prisma.Decimal(
        countBusinessDays(startStr, endStr, holidays),
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
          error: t('api.zeroLeaveDays'),
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
        dt('dm.leaveApproved', { range: formatLeaveDateRange(target.startDate, target.endDate, weekdays), type: dt(leaveTypeKey(target.type)) }),
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
