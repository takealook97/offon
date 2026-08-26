import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';
import { getT } from '@/lib/i18n/server';
import { getDeploymentT } from '@/lib/i18n/deployment';

const Body = z.object({ id: z.coerce.number().int() });

export async function POST(req: NextRequest) {
  const t = await getT();
  const dt = getDeploymentT();
  try {
    const session = await requireSession();
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
    if (target.memberId !== session.memberId) {
      return NextResponse.json({ ok: false, error: t('api.ownRequestOnly') }, { status: 403 });
    }
    if (target.status !== 'REQUESTED') {
      return NextResponse.json(
        { ok: false, error: t('api.alreadyHandledOrCancelled') },
        { status: 400 },
      );
    }

    await prisma.attendanceEditRequest.update({
      where: { id: target.id },
      data: { status: 'CANCELLED' },
    });

    await logAudit({
      actorId: session.memberId,
      action: 'ATTENDANCE_EDIT_CANCEL',
      target: String(target.id),
    });

    const requester = await prisma.member.findFirst({
      where: { id: session.memberId, deletedAt: null },
      select: { name: true },
    });
    const recipients = await prisma.member.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { slackId: true },
    });
    const text = dt('dm.editCancelledLine', { name: requester?.name ?? dt('dm.employee') });
    await Promise.all(
      recipients.map((r) =>
        sendDm(r.slackId, text).catch((err) =>
          logAudit({
            actorId: session.memberId,
            action: 'SLACK_SEND_FAIL',
            metadata: { stage: 'att_edit_cancel_notify', error: String(err) },
          }),
        ),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
