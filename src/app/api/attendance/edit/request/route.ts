import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { kstDayKey } from '@/lib/time';
import {
  EditRequestBody,
  buildAndValidateTimeline,
  buildTimelineFromSession,
  formatTimelineSummary,
  formatTimelineDate,
  timelinesEqualAtMinute,
} from '@/lib/attendance-edit';
import { getT } from '@/lib/i18n/server';
import { getDeploymentT } from '@/lib/i18n/deployment';
import { translateFailure } from '@/lib/i18n/format';

const PENDING_UNIQUE_INDEX = 'attendance_edit_requests_pending_unique';

function isPendingConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (target === PENDING_UNIQUE_INDEX) return true;
  return Array.isArray(target) && target.includes(PENDING_UNIQUE_INDEX);
}

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
    if (target.breaks.some((b) => !b.endAt)) {
      return NextResponse.json(
        { ok: false, error: t('api.editWhileAway') },
        { status: 400 },
      );
    }

    const dup = await prisma.attendanceEditRequest.findFirst({
      where: { sessionId, status: 'REQUESTED', deletedAt: null },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { ok: false, error: t('api.editPending') },
        { status: 409 },
      );
    }

    const built = buildAndValidateTimeline({ clockIn, clockOut, breaks });
    if (!built.ok) {
      return NextResponse.json({ ok: false, error: translateFailure(t, built) }, { status: 400 });
    }

    // The clock-in has to fall on the same day as the work date. Moving it elsewhere
    // contradicts the work date, which robs the one-row-per-day constraint of meaning and misdirects the reminders.
    // A clock-out crossing midnight is supported, so only the start date is checked.
    const workDateKey = kstDayKey(target.attendance.workDate);
    if (kstDayKey(new Date(built.timeline.startAt)) !== workDateKey) {
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
