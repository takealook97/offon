import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { todayKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';
import { sendChannel } from '@/lib/slack';

async function notifyChannel(name: string, kind: 'Clock in' | 'Clock out', memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  try {
    await sendChannel(channel, `${name} ${kind}`);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: `channel_${kind}`, error: String(err) },
    });
  }
}

export async function POST() {
  try {
    const session = await requireSession();
    const now = new Date();
    const date = todayKST();

    const activeOpen = await prisma.attendanceSession.findFirst({
      where: {
        endAt: null,
        deletedAt: null,
        attendance: { memberId: session.memberId, deletedAt: null },
      },
    });
    if (activeOpen) {
      return NextResponse.json(
        { ok: false, error: 'You are already clocked in' },
        { status: 400 },
      );
    }

    const existing = await prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: session.memberId, workDate: date } },
    });

    if (existing) {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.attendanceSession.create({
          data: { attendanceId: existing.id, startAt: now },
        });
        const minStart =
          existing.clockInAt && existing.clockInAt < now ? existing.clockInAt : now;
        return tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: 'WORKING',
            clockOutAt: null,
            clockInAt: minStart,
          },
        });
      });
      await logAudit({
        actorId: session.memberId,
        action: 'CLOCK_IN',
        target: String(updated.id),
        metadata: { reopen: true },
      });
      const reopenMember = await prisma.member.findUnique({
        where: { id: session.memberId },
        select: { name: true },
      });
      if (reopenMember) await notifyChannel(reopenMember.name, 'Clock in', session.memberId);
      return NextResponse.json({ ok: true, attendance: updated });
    }

    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.attendance.create({
        data: {
          memberId: session.memberId,
          workDate: date,
          status: 'WORKING',
          clockInAt: now,
        },
      });
      await tx.attendanceSession.create({
        data: { attendanceId: a.id, startAt: now },
      });
      return a;
    });

    await logAudit({
      actorId: session.memberId,
      action: 'CLOCK_IN',
      target: String(created.id),
    });
    const m = await prisma.member.findUnique({
      where: { id: session.memberId },
      select: { name: true },
    });
    if (m) await notifyChannel(m.name, 'Clock in', session.memberId);
    return NextResponse.json({ ok: true, attendance: created });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
