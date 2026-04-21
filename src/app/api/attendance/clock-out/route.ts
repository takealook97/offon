import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { formatKST } from '@/lib/time';
import { logAudit } from '@/lib/audit';
import { sendChannel } from '@/lib/slack';

const STANDARD_MINUTES = 480;
const LUNCH_DEDUCTION_THRESHOLD_MINUTES = 300;
const LUNCH_DEDUCTION_MINUTES = 60;

export async function POST() {
  try {
    const session = await requireSession();

    const open = await prisma.attendanceSession.findFirst({
      where: {
        endAt: null,
        deletedAt: null,
        attendance: { memberId: session.memberId, deletedAt: null },
      },
      orderBy: { startAt: 'desc' },
      include: { attendance: true },
    });
    if (!open) {
      return NextResponse.json(
        { ok: false, error: 'No work session is open' },
        { status: 400 },
      );
    }

    const clockOut = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      await tx.attendanceSession.update({
        where: { id: open.id },
        data: { endAt: clockOut },
      });
      const all = await tx.attendanceSession.findMany({
        where: { attendanceId: open.attendanceId, deletedAt: null },
        select: { startAt: true, endAt: true },
      });
      const closed = all.filter((s) => s.endAt);
      const rawWorked = closed.reduce(
        (sum, s) => sum + Math.floor((s.endAt!.getTime() - s.startAt.getTime()) / 60000),
        0,
      );
      const worked =
        rawWorked >= LUNCH_DEDUCTION_THRESHOLD_MINUTES
          ? rawWorked - LUNCH_DEDUCTION_MINUTES
          : rawWorked;
      const overtime = Math.max(0, worked - STANDARD_MINUTES);
      const minStart = all.reduce<Date | null>(
        (min, s) => (min === null || s.startAt < min ? s.startAt : min),
        null,
      );
      const maxEnd = closed.reduce<Date | null>(
        (max, s) => (max === null || s.endAt! > max ? s.endAt! : max),
        null,
      );
      return tx.attendance.update({
        where: { id: open.attendanceId },
        data: {
          clockInAt: minStart ?? open.attendance.clockInAt,
          clockOutAt: maxEnd,
          workedMinutes: worked,
          overtimeMinutes: overtime,
          status: 'DONE',
        },
      });
    });

    await logAudit({
      actorId: session.memberId,
      action: 'CLOCK_OUT',
      target: String(updated.id),
      metadata: { worked: updated.workedMinutes, overtime: updated.overtimeMinutes },
    });
    const channel = process.env.SLACK_OFFON_CHANNEL;
    if (channel) {
      const m = await prisma.member.findUnique({
        where: { id: session.memberId },
        select: { name: true },
      });
      if (m) {
        const text = `${formatKST(clockOut, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${m.name} clocked out\ud83c\udf19`;
        try {
          await sendChannel(channel, text);
        } catch (err) {
          await logAudit({
            actorId: session.memberId,
            action: 'SLACK_SEND_FAIL',
            metadata: { stage: 'channel_Clock out', error: String(err) },
          });
        }
      }
    }
    return NextResponse.json({ ok: true, attendance: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
