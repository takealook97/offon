import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { computeAttendanceTotals } from '@/lib/attendance';
import { asTimeline } from '@/lib/attendance-edit';

const Body = z.object({ id: z.coerce.number().int() });

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'That input is not valid' }, { status: 400 });
    }

    const target = await prisma.attendanceEditRequest.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: 'That correction request no longer exists' }, { status: 404 });
    }
    if (target.status !== 'REQUESTED') {
      return NextResponse.json({ ok: false, error: 'That request was already handled' }, { status: 400 });
    }

    const session = await prisma.attendanceSession.findFirst({
      where: { id: target.sessionId, deletedAt: null },
      select: { id: true },
    });
    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'That session no longer exists' },
        { status: 404 },
      );
    }

    const proposed = asTimeline(target.proposed);

    await prisma.$transaction(async (tx) => {
      await tx.attendanceSession.update({
        where: { id: target.sessionId },
        // A null end in the proposal means the session is still running, so it stays open.
        data: {
          startAt: new Date(proposed.startAt),
          endAt: proposed.endAt ? new Date(proposed.endAt) : null,
        },
      });
      // Every existing break is soft-deleted and recreated closed, from the proposal.
      await tx.attendanceBreak.updateMany({
        where: { sessionId: target.sessionId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const b of proposed.breaks) {
        // Editing does not distinguish meals from breaks, so the kind takes its default.
        await tx.attendanceBreak.create({
          data: {
            attendanceId: target.attendanceId,
            sessionId: target.sessionId,
            startAt: new Date(b.startAt),
            endAt: new Date(b.endAt),
          },
        });
      }
      const [allSessions, allBreaks] = await Promise.all([
        tx.attendanceSession.findMany({
          where: { attendanceId: target.attendanceId, deletedAt: null },
          select: { startAt: true, endAt: true },
        }),
        tx.attendanceBreak.findMany({
          where: { attendanceId: target.attendanceId, deletedAt: null },
          select: { startAt: true, endAt: true },
        }),
      ]);
      const totals = computeAttendanceTotals(allSessions, allBreaks);
      await tx.attendance.update({
        where: { id: target.attendanceId },
        data: {
          clockInAt: totals.clockInAt,
          clockOutAt: totals.clockOutAt,
          workedMinutes: totals.workedMinutes,
          breakMinutes: totals.breakMinutes,
          overtimeMinutes: totals.overtimeMinutes,
        },
      });
      await tx.attendanceEditRequest.update({
        where: { id: target.id },
        data: { status: 'APPROVED', approverId: admin.memberId },
      });
    });

    await logAudit({
      actorId: admin.memberId,
      action: 'ATTENDANCE_EDIT_APPROVE',
      target: String(target.id),
      metadata: { memberId: target.memberId, sessionId: target.sessionId },
    });

    const requester = await prisma.member.findFirst({
      where: { id: target.memberId, deletedAt: null },
      select: { slackId: true },
    });
    if (requester?.slackId) {
      await sendDm(
        requester.slackId,
        'Your attendance correction was approved.',
      ).catch((err) =>
        logAudit({
          actorId: admin.memberId,
          action: 'SLACK_SEND_FAIL',
          metadata: { stage: 'att_edit_approve_notify', error: String(err) },
        }),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
