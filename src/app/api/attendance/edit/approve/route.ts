import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import {
  cancelAutoBack,
  computeAttendanceTotals,
  lockSession,
  scheduleAutoBack,
} from '@/lib/attendance';
import {
  asTimeline,
  buildTimelineFromSession,
  normalizeBreakKind,
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

    const proposed = asTimeline(target.proposed);
    const snapshot = asTimeline(target.snapshot);
    const now = new Date();

    const outcome = await prisma.$transaction(async (tx) => {
      // The live state is read only after locking the session row. With the check and the write apart,
      // a meal the employee starts in between is quietly soft-deleted below, and its scheduled id
      // is not in the cancel list, so a ghost return notice lands in the channel an hour later.
      await lockSession(tx, target.sessionId);
      const liveSession = await tx.attendanceSession.findFirst({
        where: { id: target.sessionId, deletedAt: null },
        include: {
          breaks: {
            where: { deletedAt: null },
            orderBy: { startAt: 'asc' },
            select: {
              startAt: true,
              endAt: true,
              kind: true,
              autoBackMessageId: true,
              autoBackChannelId: true,
            },
          },
        },
      });
      if (!liveSession) return { code: 'NOT_FOUND' as const };

      // The approval is refused while a break is still open.
      // Approving anyway would have the rebuild below soft-delete the open break row, leaving
      // the status stuck as away, with the person able neither to come back nor to clock out.
      if (liveSession.breaks.some((b) => !b.endAt)) return { code: 'OPEN_BREAK' as const };

      // Refuses when the session has changed since the snapshot: a clock-out, a new meal or a new break.
      // Overwriting it outright would erase something the person never saw.
      const currentTimeline = buildTimelineFromSession(
        { startAt: liveSession.startAt, endAt: liveSession.endAt },
        liveSession.breaks,
      );
      if (!timelinesEqualAtMinute(snapshot, currentTimeline)) {
        return { code: 'DRIFT' as const };
      }

      // A meal still running has a Slack return notice scheduled. Deleting and recreating the break rows
      // Deleting and recreating would orphan it, so unchanged times carry the id straight to the new row
      // with no cancel; a meal whose times moved, or that is gone, is cancelled and scheduled afresh.
      // The key is taken to the minute because stored values keep seconds while the proposal is built
      // from a wall clock and always has zero seconds. At millisecond precision nothing carries across, so
      // even a correction that never touched the times, and a refused cancel means two notices.
      // Meals are fixed blocks and cannot overlap, so a minute-level collision only comes from duplicate rows,
      // The values are arrays so nothing is left uncancelled even then.
      const pendingSchedules = new Map<string, { messageId: string; channelId: string }[]>();
      const scheduleKey = (start: Date, end: Date) =>
        `${Math.floor(start.getTime() / 60_000)}-${Math.floor(end.getTime() / 60_000)}`;
      for (const b of liveSession.breaks) {
        if (!b.autoBackMessageId || !b.autoBackChannelId) continue;
        if (!b.endAt || b.endAt.getTime() <= now.getTime()) continue;
        const key = scheduleKey(b.startAt, b.endAt);
        const bucket = pendingSchedules.get(key) ?? [];
        bucket.push({ messageId: b.autoBackMessageId, channelId: b.autoBackChannelId });
        pendingSchedules.set(key, bucket);
      }

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
      const pendingLunches: { id: number; endAt: Date }[] = [];
      for (const b of proposed.breaks) {
        const kind = normalizeBreakKind(b.kind);
        const startAt = new Date(b.startAt);
        const endAt = new Date(b.endAt);
        const key = scheduleKey(startAt, endAt);
        // Unchanged times carry the existing schedule to the new row, with no cancel and no rescheduling.
        const carried = kind === 'LUNCH' ? pendingSchedules.get(key)?.shift() : undefined;
        const created = await tx.attendanceBreak.create({
          data: {
            attendanceId: target.attendanceId,
            sessionId: target.sessionId,
            startAt,
            endAt,
            kind,
            autoBackMessageId: carried?.messageId ?? null,
            autoBackChannelId: carried?.channelId ?? null,
          },
          select: { id: true },
        });
        if (!carried && kind === 'LUNCH' && endAt.getTime() > now.getTime()) {
          pendingLunches.push({ id: created.id, endAt });
        }
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
      return {
        pendingLunches,
        // Whatever was not carried across belongs to a meal that was deleted or moved.
        staleSchedules: Array.from(pendingSchedules.values()).flat(),
      };
    });

    if ('code' in outcome) {
      const reason =
        outcome.code === 'OPEN_BREAK'
          ? 'open_break'
          : outcome.code === 'DRIFT'
            ? 'snapshot_drift'
            : 'session_not_found';
      if (outcome.code === 'NOT_FOUND') {
        return NextResponse.json(
          { ok: false, error: 'That session no longer exists' },
          { status: 404 },
        );
      }
      await logAudit({
        actorId: admin.memberId,
        action: 'ATTENDANCE_EDIT_APPROVE_BLOCKED',
        target: String(target.id),
        metadata: { reason, sessionId: target.sessionId, memberId: target.memberId },
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            outcome.code === 'OPEN_BREAK'
              ? 'They are away right now. Try again once they are back'
              : 'Their attendance changed after this request, so it can no longer be approved. Ask them to request it again.',
        },
        { status: 409 },
      );
    }

    await logAudit({
      actorId: admin.memberId,
      action: 'ATTENDANCE_EDIT_APPROVE',
      target: String(target.id),
      metadata: { memberId: target.memberId, sessionId: target.sessionId },
    });

    const requester = await prisma.member.findFirst({
      where: { id: target.memberId, deletedAt: null },
      select: { slackId: true, name: true },
    });

    // Cancel whatever was not carried across, then schedule afresh for the meals that need it.
    // If a cancel fails -- Slack refuses to cancel anything due within 60 seconds -- the old message is still live, so
    // nothing new is scheduled; doing so would send the same person two return notices.
    // The attendance data is already correct, and one notice goes out as originally planned.
    const cancelled = await cancelAutoBack(
      outcome.staleSchedules.map((s) => ({
        autoBackChannelId: s.channelId,
        autoBackMessageId: s.messageId,
      })),
      admin.memberId,
    );
    let autoBackWarning: string | null = null;
    if (cancelled) {
      for (const lunch of outcome.pendingLunches) {
        const ok = await scheduleAutoBack(
          lunch.id,
          requester?.name ?? null,
          lunch.endAt,
          admin.memberId,
        );
        if (!ok) autoBackWarning = 'Could not schedule the automatic return notice';
      }
    } else if (outcome.pendingLunches.length > 0) {
      autoBackWarning = 'Could not cancel the existing return notice, so nothing was rescheduled';
      await logAudit({
        actorId: admin.memberId,
        action: 'LUNCH_AUTO_BACK_RESCHEDULE_SKIPPED',
        target: String(target.id),
        metadata: {
          reason: 'stale_cancel_failed',
          skipped: outcome.pendingLunches.map((l) => l.id),
        },
      });
    }

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

    // The attendance change is done, but the scheduled Slack messages are out of step, so the admin is told and can check by hand.
    return NextResponse.json({ ok: true, warning: autoBackWarning ?? undefined });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
