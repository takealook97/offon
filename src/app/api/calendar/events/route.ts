import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { formatKST } from '@/lib/time';
import type { CalendarEvent } from '@/lib/api-types';

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function halfDayRange(workDate: Date, type: 'HALF_DAY_AM' | 'HALF_DAY_PM') {
  const base = new Date(workDate);
  const start = new Date(base);
  const end = new Date(base);
  if (type === 'HALF_DAY_AM') {
    start.setHours(9, 0, 0, 0);
    end.setHours(13, 0, 0, 0);
  } else {
    start.setHours(13, 0, 0, 0);
    end.setHours(18, 0, 0, 0);
  }
  return { start, end };
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json({ ok: false, error: 'start and end query parameters are required' }, { status: 400 });
    }

    const [attendances, leaves] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          memberId: session.memberId,
          workDate: { gte: start, lte: end },
          deletedAt: null,
        },
        include: {
          sessions: { where: { deletedAt: null }, orderBy: { startAt: 'asc' } },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          memberId: session.memberId,
          status: 'APPROVED',
          startDate: { lte: end },
          endDate: { gte: start },
          deletedAt: null,
        },
      }),
    ]);

    const events: CalendarEvent[] = [];
    const now = new Date();

    for (const a of attendances) {
      if (a.sessions.length === 0) continue;
      for (const s of a.sessions) {
        const endAt = s.endAt ?? now;
        const minutes = Math.max(
          0,
          Math.floor((endAt.getTime() - s.startAt.getTime()) / 60000),
        );
        const inLabel = formatKST(s.startAt, 'HH:mm');
        const outLabel = s.endAt ? formatKST(s.endAt, 'HH:mm') : 'In progress';
        events.push({
          id: `sess-${s.id}`,
          title: `${inLabel} ~ ${outLabel} · ${formatDuration(minutes)}`,
          start: s.startAt.toISOString(),
          end: endAt.toISOString(),
          allDay: false,
          resource: {
            kind: 'ATTENDANCE',
            workedMinutes: minutes,
            overtimeMinutes: 0,
            attendanceStatus: s.endAt ? 'DONE' : 'WORKING',
          },
        });
      }
    }

    for (const l of leaves) {
      if (l.type === 'FULL_DAY') {
        const endExclusive = new Date(l.endDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        events.push({
          id: `leave-${l.id}`,
          title: 'Leave (full day)',
          start: l.startDate.toISOString(),
          end: endExclusive.toISOString(),
          allDay: true,
          resource: {
            kind: 'LEAVE',
            leaveType: 'FULL_DAY',
            leaveStatus: 'APPROVED',
          },
        });
      } else {
        const { start: s, end: e } = halfDayRange(
          l.startDate,
          l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
        );
        const suffix = l.type === 'HALF_DAY_AM' ? '(morning)' : '(afternoon)';
        events.push({
          id: `leave-${l.id}`,
          title: `Leave${suffix}`,
          start: s.toISOString(),
          end: e.toISOString(),
          allDay: false,
          resource: {
            kind: 'LEAVE',
            leaveType: l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
            leaveStatus: 'APPROVED',
          },
        });
      }
    }

    return NextResponse.json({ events });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
