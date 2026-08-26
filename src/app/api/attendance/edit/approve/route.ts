import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { cancelAutoBack, scheduleAutoBack } from '@/lib/attendance';
import { applyAttendanceEditApproval } from '@/lib/attendance-edit-approval';
import { getT } from '@/lib/i18n/server';
import { getDeploymentT } from '@/lib/i18n/deployment';

const Body = z.object({ id: z.coerce.number().int() });

export async function POST(req: NextRequest) {
  const t = await getT();
  const dt = getDeploymentT();
  try {
    const admin = await requireAdmin();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: t('api.badInput') }, { status: 400 });
    }

    const target = await prisma.attendanceEditRequest.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: t('api.editNotFound') }, { status: 404 });
    }
    if (target.status !== 'REQUESTED') {
      return NextResponse.json({ ok: false, error: t('api.alreadyHandled') }, { status: 400 });
    }

    const now = new Date();
    const outcome = await applyAttendanceEditApproval(target, admin.memberId, now);

    if ('code' in outcome) {
      const reason =
        outcome.code === 'OPEN_BREAK'
          ? 'open_break'
          : outcome.code === 'DRIFT'
            ? 'snapshot_drift'
            : 'session_not_found';
      if (outcome.code === 'NOT_FOUND') {
        return NextResponse.json(
          { ok: false, error: t('api.targetSessionNotFound') },
          { status: 404 },
        );
      }
      await logAudit({
        actorId: admin.memberId,
        action: 'ATTENDANCE_EDIT_APPROVE_BLOCKED',
        target: String(target.id),
        metadata: {
          reason,
          sessionId: target.sessionId,
          memberId: target.memberId,
          ...('conflicts' in outcome ? { conflicts: outcome.conflicts } : {}),
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            outcome.code === 'OPEN_BREAK'
              ? t('api.memberAway')
              : t('api.staleEdit'),
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
        if (!ok) autoBackWarning = t('api.mealScheduleFailed');
      }
    } else {
      // A failed cancel is reported whether or not anything was rescheduled. Deleting a meal outright leaves
      // nothing to reschedule but keeps the old message alive, so a notice for a meal that is gone still lands.
      autoBackWarning =
        outcome.pendingLunches.length > 0
          ? t('api.mealRescheduleSkipped')
          : t('api.mealCancelFailed');
      await logAudit({
        actorId: admin.memberId,
        action: 'LUNCH_AUTO_BACK_CANCEL_FAILED',
        target: String(target.id),
        metadata: {
          reason: 'stale_cancel_failed',
          skippedReschedule: outcome.pendingLunches.map((l) => l.id),
        },
      });
    }

    if (requester?.slackId) {
      await sendDm(
        requester.slackId,
        dt('dm.editApproved'),
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
