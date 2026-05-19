import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { formatKST } from '@/lib/time';
import {
  parseDate,
  kstIsoFromDate,
  addDaysUtc,
  halfDayIsoRange,
} from '@/lib/calendar-utils';
import { clippedDailyTotals } from '@/lib/calendar-aggregation';
import type { CalendarEvent } from '@/lib/api-types';

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
    const memberIdRaw = req.nextUrl.searchParams.get('memberId');
    const parsedMemberId = memberIdRaw ? Number(memberIdRaw) : null;
    const targetMemberId =
      parsedMemberId && Number.isInteger(parsedMemberId) && parsedMemberId > 0
        ? parsedMemberId
        : session.memberId;
    // Calendar events are visible to any signed-in member.
    // As the team calendar already does, a colleague's attendance and leave
    // can be looked up through the search tab by any member.

    const [attendances, leaves] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          memberId: targetMemberId,
          workDate: { gte: start, lte: end },
          deletedAt: null,
        },
        include: {
          sessions: { where: { deletedAt: null }, orderBy: { startAt: 'asc' } },
          breaks: { where: { deletedAt: null }, orderBy: { startAt: 'asc' } },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          memberId: targetMemberId,
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
      const dayStatus: 'WORKING' | 'ON_BREAK' | 'DONE' =
        a.status === 'DONE' ? 'DONE' : a.status === 'ON_BREAK' ? 'ON_BREAK' : 'WORKING';
      // Each session's duration, used only in the event title. An open session keeps running
      // even while the person is away, so it is filled to now.
      const sessionMinutes = a.sessions.map((s) => {
        const endAt =
          s.endAt ?? (dayStatus === 'WORKING' || dayStatus === 'ON_BREAK' ? now : s.startAt);
        return Math.max(
          0,
          Math.floor((endAt.getTime() - s.startAt.getTime()) / 60000),
        );
      });
      // Day totals: a finished day uses its stored values, anything else is computed live as session span minus break span.
      const sessionSpanMin = a.sessions.reduce((sum, s) => {
        const endAt =
          s.endAt ?? (dayStatus === 'WORKING' || dayStatus === 'ON_BREAK' ? now : null);
        if (!endAt) return sum;
        return sum + Math.max(0, Math.floor((endAt.getTime() - s.startAt.getTime()) / 60000));
      }, 0);
      const breakSpanMin = a.breaks.reduce((sum, b) => {
        const endAt = b.endAt ?? (dayStatus === 'ON_BREAK' ? now : null);
        if (!endAt) return sum;
        return sum + Math.max(0, Math.floor((endAt.getTime() - b.startAt.getTime()) / 60000));
      }, 0);
      const dayWorkedMinutes =
        dayStatus === 'DONE' ? a.workedMinutes : Math.max(0, sessionSpanMin - breakSpanMin);
      const dayBreakMinutes = dayStatus === 'DONE' ? a.breakMinutes : breakSpanMin;
      const dayOvertimeMinutes = dayStatus === 'DONE' ? a.overtimeMinutes : 0;
      a.sessions.forEach((s, idx) => {
        const endAt = s.endAt ?? now;
        const minutes = sessionMinutes[idx];
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
            workedMinutes: dayWorkedMinutes,
            overtimeMinutes: dayOvertimeMinutes,
            breakMinutes: dayBreakMinutes,
            attendanceStatus: dayStatus,
            isOpenSession: s.endAt === null,
          },
        });
      });
    }

    for (const l of leaves) {
      if (l.type === 'FULL_DAY') {
        events.push({
          id: `leave-${l.id}`,
          title: 'Leave (full day)',
          start: kstIsoFromDate(l.startDate),
          end: kstIsoFromDate(addDaysUtc(l.endDate, 1)),
          allDay: true,
          resource: {
            kind: 'LEAVE',
            leaveType: 'FULL_DAY',
            leaveStatus: 'APPROVED',
          },
        });
      } else {
        const { start: s, end: e } = halfDayIsoRange(
          l.startDate,
          l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
        );
        const suffix = l.type === 'HALF_DAY_AM' ? '(morning)' : '(afternoon)';
        events.push({
          id: `leave-${l.id}`,
          title: `Half day${suffix}`,
          start: s,
          end: e,
          allDay: false,
          resource: {
            kind: 'LEAVE',
            leaveType: l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
            leaveStatus: 'APPROVED',
          },
        });
      }
    }

    const dailyTotals = clippedDailyTotals(
      attendances.map((a) => ({
        status: a.status,
        sessions: a.sessions.map((s) => ({ startAt: s.startAt, endAt: s.endAt })),
        breaks: a.breaks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
      })),
      now,
    );
    return NextResponse.json({ ok: true, events, dailyTotals });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events] failed', e);
    return NextResponse.json(
      { ok: false, error: 'Could not load the calendar events' },
      { status: 500 },
    );
  }
}
