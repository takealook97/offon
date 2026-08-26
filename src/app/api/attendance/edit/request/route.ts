import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { dayKey } from '@/lib/time';
import {
  EditRequestBody,
  buildAndValidateTimeline,
  buildTimelineFromSession,
  formatTimelineSummary,
  formatTimelineDate,
  timelinesEqualAtMinute,
} from '@/lib/attendance-edit';
import {
  isAwayNow,
  storedMealMinutes,
  clockInMatchesWorkDate,
  isPendingConflict,
  findPendingEditRequest,
} from '@/lib/attendance-edit-request';
import { getT } from '@/lib/i18n/server';
import { getAppSettings } from '@/lib/settings';
import { getDeploymentT } from '@/lib/i18n/deployment';
import { translateFailure } from '@/lib/i18n/format';

export async function POST(req: NextRequest) {
  const t = await getT();
  const dt = getDeploymentT();
  try {
    const session = await requireSession();
    const parsed = EditRequestBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: t('api.badInput') }, { status: 400 });
    }
    const { sessionId, reason, clockIn, clockOut, breaks } = parsed.data;

    const target = await prisma.attendanceSession.findFirst({
      where: {
        id: sessionId,
        deletedAt: null,
        attendance: { memberId: session.memberId, deletedAt: null },
      },
      include: {
        attendance: { select: { workDate: true } },
        breaks: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true, kind: true },
        },
      },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: t('api.sessionNotFound') }, { status: 404 });
    }
    // A session still running can have its clock-in and breaks corrected.
    // The one exception is someone away right now, who is asked to come back first.
    // A meal is a closed break with its end already fixed, so it does not trip this; even one in progress can be edited or removed.
    if (isAwayNow(target.breaks)) {
      return NextResponse.json(
        { ok: false, error: t('api.editWhileAway') },
        { status: 400 },
      );
    }

    const dup = await findPendingEditRequest(sessionId);
    if (dup) {
      return NextResponse.json(
        { ok: false, error: t('api.editPending') },
        { status: 409 },
      );
    }

    const built = buildAndValidateTimeline({ clockIn, clockOut, breaks }, new Date(), {
      current: (await getAppSettings()).mealMinutes,
      allowed: storedMealMinutes(target.breaks),
    });
    if (!built.ok) {
      return NextResponse.json({ ok: false, error: translateFailure(t, built) }, { status: 400 });
    }

    const workDateKey = dayKey(target.attendance.workDate);
    if (!clockInMatchesWorkDate(built.timeline.startAt, target.attendance.workDate)) {
      return NextResponse.json(
        { ok: false, error: t('api.clockInDayMismatch', { date: workDateKey }) },
        { status: 400 },
      );
    }

    const snapshot = buildTimelineFromSession(
      { startAt: target.startAt, endAt: target.endAt },
      target.breaks,
    );

    if (timelinesEqualAtMinute(snapshot, built.timeline)) {
      return NextResponse.json(
        { ok: false, error: t('edit.noChanges') },
        { status: 400 },
      );
    }

    let record;
    try {
      record = await prisma.attendanceEditRequest.create({
        data: {
          memberId: session.memberId,
          sessionId,
          attendanceId: target.attendanceId,
          status: 'REQUESTED',
          reason: reason ?? null,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          proposed: built.timeline as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // The race between the lookup and the create — a double-click or two concurrent requests —
      // is stopped by the attendance_edit_requests_pending_unique index.
      if (isPendingConflict(err)) {
        return NextResponse.json(
          { ok: false, error: t('api.editPending') },
          { status: 409 },
        );
      }
      throw err;
    }

    await logAudit({
      actorId: session.memberId,
      action: 'ATTENDANCE_EDIT_REQUEST',
      target: String(record.id),
      metadata: { sessionId },
    });

    const requester = await prisma.member.findFirst({
      where: { id: session.memberId, deletedAt: null },
      select: { name: true },
    });
    const recipients = await prisma.member.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { slackId: true },
    });
    const text =
      `${dt('dm.editRequestedLine', { name: requester?.name ?? dt('dm.employee') })}\n` +
      `${formatTimelineDate(snapshot)}\n\n` +
      `${dt('dm.before')} ${formatTimelineSummary(t, snapshot)}\n` +
      `${dt('dm.after')} ${formatTimelineSummary(t, built.timeline)}`;
    await Promise.all(
      recipients.map((r) =>
        sendDm(r.slackId, text).catch((err) =>
          logAudit({
            actorId: session.memberId,
            action: 'SLACK_SEND_FAIL',
            metadata: { stage: 'att_edit_request_notify', error: String(err) },
          }),
        ),
      ),
    );

    return NextResponse.json({ ok: true, id: record.id });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
