import { prisma } from './prisma';
import { workHours } from './settings';
import { standardWorkMinutes } from './work-hours';
import { computeAttendanceTotals, lockSession } from './attendance';
import {
  asTimeline,
  buildTimelineFromSession,
  mergeAttendanceEditTimeline,
  normalizeBreakKind,
  type TimelineMergeConflict,
} from './attendance-edit';

export type EditApprovalOutcome =
  | { code: 'NOT_FOUND' }
  | { code: 'OPEN_BREAK' }
  | { code: 'DRIFT'; conflicts: TimelineMergeConflict[] }
  | {
      pendingLunches: { id: number; endAt: Date }[];
      staleSchedules: { messageId: string; channelId: string }[];
    };

export type EditApprovalTarget = {
  id: number;
  sessionId: number;
  attendanceId: number;
  snapshot: unknown;
  proposed: unknown;
};

/**
 * Applies an approved attendance correction to the record itself.
 *
 * It lives here rather than in the route because one call overwrites someone's recorded
 * hours. The three refusals — a session that has gone, a break still running, and a clash
 * with changes made since the request — all exist to stop data being quietly corrupted, and
 * guards like that get deleted by the next person unless tests hold them in place.
 */
export async function applyAttendanceEditApproval(
  target: EditApprovalTarget,
  approverId: number,
  now: Date = new Date(),
): Promise<EditApprovalOutcome> {
  const proposed = asTimeline(target.proposed);
  const snapshot = asTimeline(target.snapshot);
  // The overtime threshold derives from the org's working hours. Read once, outside the transaction.
  const standardMinutes = standardWorkMinutes(await workHours());

  return prisma.$transaction(async (tx) => {
    // Read the live state only after locking the session row. With the check and the write
    // apart, a meal the employee starts in between is quietly soft-deleted below, and since
    // its scheduled id is not in the cancel list, a ghost "back at their desk" lands in the
    // channel an hour later.
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

    // Refuse while a break is still open. Approving anyway would have the break-rebuild
    // below soft-delete the open row, leaving the attendance stuck at ON_BREAK with the
    // employee unable to either come back or clock out.
    if (liveSession.breaks.some((b) => !b.endAt)) return { code: 'OPEN_BREAK' as const };

    // Whatever happened legitimately since the request — a clock-out, a new meal or break —
    // is kept, and only the fields the requester actually changed are merged in. When the
    // same field, or the same existing break, was changed differently on both sides, we do
    // not guess which should win and block the approval instead.
    const currentTimeline = buildTimelineFromSession(
      { startAt: liveSession.startAt, endAt: liveSession.endAt },
      liveSession.breaks,
    );
    const merged = mergeAttendanceEditTimeline(snapshot, proposed, currentTimeline);
    if (!merged.ok) {
      return { code: 'DRIFT' as const, conflicts: merged.conflicts };
    }
    const approved = merged.timeline;

    // A meal still running, its end still in the future, has a Slack return notice scheduled.
    // Deleting and recreating the break rows below would orphan it, so a meal whose times are
    // unchanged carries its scheduled id across to the new row with no cancel and no
    // rescheduling. A meal whose times moved, or that is gone, is cancelled and scheduled afresh.
    // The key is taken to the minute because stored values keep seconds and milliseconds while
    // the proposed timeline is built from a wall clock and always has zero seconds. Comparing
    // at millisecond precision would carry nothing across, so every correction — even one that
    // never touched the times — would cancel and reschedule, and a refused cancel means two notices.
    // Meals are fixed blocks and cannot overlap, so a minute-level key collision only arises
    // from duplicate rows at the same instant; the values are arrays so nothing is left uncancelled
    // even then.
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
      // A clock-out the request did not touch keeps whatever the live value was at approval time.
      data: {
        startAt: new Date(approved.startAt),
        endAt: approved.endAt ? new Date(approved.endAt) : null,
      },
    });
    // Soft-delete every existing break, then recreate them closed from the merged result.
    // The guard above guarantees none was open, so nobody ends up stuck on a break.
    await tx.attendanceBreak.updateMany({
      where: { sessionId: target.sessionId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    const pendingLunches: { id: number; endAt: Date }[] = [];
    for (const b of approved.breaks) {
      const kind = normalizeBreakKind(b.kind);
      const startAt = new Date(b.startAt);
      const endAt = new Date(b.endAt);
      const key = scheduleKey(startAt, endAt);
      // Unchanged times carry the existing scheduled message to the new row, with no cancel and no rescheduling.
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
    const totals = computeAttendanceTotals(allSessions, allBreaks, standardMinutes);
    // The guard above guarantees no break is open, so the status follows purely from whether
    // the session has an endAt. A correction that fills in a clock-out moves WORKING to DONE,
    // which keeps the row consistent rather than orphaned.
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
      data: { status: 'APPROVED', approverId: approverId },
    });
    return {
      pendingLunches,
      // Whatever was not carried across belongs to a meal that was deleted or moved.
      staleSchedules: Array.from(pendingSchedules.values()).flat(),
    };
  });
}
