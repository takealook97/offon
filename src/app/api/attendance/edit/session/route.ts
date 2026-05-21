import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { buildEditableSession } from '@/lib/attendance-edit';

// Returns your own session shaped for editing — clock-in, clock-out and breaks — when a correction is opened from the calendar.
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
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
          select: { startAt: true, endAt: true },
        },
      },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }
    if (target.breaks.some((b) => !b.endAt)) {
      return NextResponse.json(
        { ok: false, error: 'This cannot be edited while you are away. Try again once you are back' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      session: buildEditableSession(
        { id: target.id, startAt: target.startAt, endAt: target.endAt },
        target.breaks,
      ),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
