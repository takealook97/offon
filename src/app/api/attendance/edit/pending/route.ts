import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
  asTimeline,
  formatTimelineDate,
  formatTimelineSummary,
} from '@/lib/attendance-edit';

// Returns all of your own pending attendance corrections, for the list below the calendar.
export async function GET() {
  try {
    const session = await requireSession();
    const rows = await prisma.attendanceEditRequest.findMany({
      where: { memberId: session.memberId, status: 'REQUESTED', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, snapshot: true, proposed: true },
    });
    const items = rows.map((r) => {
      const before = asTimeline(r.snapshot);
      const after = asTimeline(r.proposed);
      return {
        id: r.id,
        dateLabel: formatTimelineDate(after),
        before: formatTimelineSummary(before),
        after: formatTimelineSummary(after),
      };
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
