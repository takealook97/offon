import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { computeAttendanceTotals } from '@/lib/attendance';
import {
  asTimeline,
  buildTimelineFromSession,
  timelinesEqualAtMinute,
} from '@/lib/attendance-edit';

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

    // The session and any break can change after the request, so the live state is re-read just before approving.
    // The proposal was built from the snapshot taken at request time, so a clash with the live state is refused.
    const liveSession = await prisma.attendanceSession.findFirst({
      where: { id: target.sessionId, deletedAt: null },
      include: {
        breaks: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true },
        },
      },
    });
    if (!liveSession) {
      return NextResponse.json(
        { ok: false, error: 'That session no longer exists' },
        { status: 404 },
      );
    }

    // Refuse while a break is still open. Approving anyway would have the break-rebuild
    // below soft-delete the open row, leaving the attendance stuck at ON_BREAK with the
    // employee unable to either come back or clock out.
    if (liveSession.breaks.some((b) => !b.endAt)) {
      await logAudit({
        actorId: admin.memberId,
        action: 'ATTENDANCE_EDIT_APPROVE_BLOCKED',
        target: String(target.id),
        metadata: {
          reason: 'open_break',
          sessionId: target.sessionId,
          memberId: target.memberId,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'They are away right now. Try again once they are back',
        },
        { status: 409 },
      );
    }

    // Refuses when the session has changed since the snapshot: a clock-out, a new break, and so on.
    // Overwriting outright would erase things the person never saw: a clock-out, a new break.
    const currentTimeline = buildTimelineFromSession(
      { startAt: liveSession.startAt, endAt: liveSession.endAt },
      liveSession.breaks,
    );
    const snapshot = asTimeline(target.snapshot);
    if (!timelinesEqualAtMinute(snapshot, currentTimeline)) {
      await logAudit({
        actorId: admin.memberId,
        action: 'ATTENDANCE_EDIT_APPROVE_BLOCKED',
        target: String(target.id),
        metadata: {
          reason: 'snapshot_drift',
          sessionId: target.sessionId,
          memberId: target.memberId,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'Their attendance changed after this request, so it can no longer be approved. Ask them to request it again.',
        },
        { status: 409 },
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
      // The guard above guarantees none was open, so nobody ends up stuck on a break.
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
      // The guard above guarantees no break is open, so the status follows purely from the session end.
      // A proposal that fills in a clock-out moves the status to done, which keeps the row consistent.
      const hasOpenSession = allSessions.some((s) => !s.endAt);
      const nextStatus: 'WORKING' | 'DONE' = hasOpenSession ? 'WORKING' : 'DONE';
      await tx.attendance.update({
        where: { id: target.attendanceId },
        data: {
          clockInAt: totals.clockInAt,
          clockOutAt: totals.clockOutAt,
          workedMinutes: totals.workedMinutes,
          breakMinutes: totals.breakMinutes,
          overtimeMinutes: totals.overtimeMinutes,
          status: nextStatus,
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
