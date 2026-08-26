import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { buildEditableSession } from '@/lib/attendance-edit';
import { getT } from '@/lib/i18n/server';
import { getLocale } from '@/lib/i18n/server';
import { getAppSettings } from '@/lib/settings';

// Returns your own session shaped for editing — clock-in, clock-out and breaks — when a correction is opened from the calendar.
export async function GET(req: NextRequest) {
  const t = await getT();
  try {
    const session = await requireSession();
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: t('api.badRequest') }, { status: 400 });
    }

    const target = await prisma.attendanceSession.findFirst({
      where: {
        id,
        deletedAt: null,
        attendance: { memberId: session.memberId, deletedAt: null },
      },
      include: {
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
    if (target.breaks.some((b) => !b.endAt)) {
      return NextResponse.json(
        { ok: false, error: t('api.modifyWhileAway') },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      session: buildEditableSession(
        { id: target.id, startAt: target.startAt, endAt: target.endAt },
        target.breaks,
        await getLocale(),
        (await getAppSettings()).mealMinutes,
      ),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
