import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';

const Body = z.object({
  type: z.enum(['FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

function dayCount(start: string, end: string, type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM') {
  if (type !== 'FULL_DAY') return new Prisma.Decimal(0.5);
  const s = new Date(start);
  const e = new Date(end);
  const days = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return new Prisma.Decimal(days);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: '입력이 올바르지 않습니다' }, { status: 400 });
    }
    const { type, startDate, endDate, reason } = parsed.data;
    if (type !== 'FULL_DAY' && startDate !== endDate) {
      return NextResponse.json(
        { ok: false, error: '반차는 당일 범위로만 신청 가능합니다' },
        { status: 400 },
      );
    }
    const days = dayCount(startDate, endDate, type);

    const record = await prisma.leaveRequest.create({
      data: {
        memberId: session.memberId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days,
        status: 'REQUESTED',
        reason,
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
      where: { role: 'ADMIN', active: true, deletedAt: null },
    });
    await Promise.all(
      admins.map((a) =>
        sendDm(
          a.slackId,
          `${requester?.name ?? '직원'}님이 ${startDate}~${endDate} ${type} 연차를 신청했습니다`,
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
