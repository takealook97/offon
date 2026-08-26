import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { formatZoned } from '@/lib/time';
import {
  parseDate,
  zonedIsoFromDate,
  addDaysUtc,
  halfDayIsoRange,
} from '@/lib/calendar-utils';
import { clippedDailyTotals } from '@/lib/calendar-aggregation';
import { resolveCalendarTarget } from '@/lib/calendar-access';
import type { CalendarEvent } from '@/lib/api-types';
import { workHours } from '@/lib/settings';
import { getT } from '@/lib/i18n/server';
import { formatDuration } from '@/lib/i18n/format';


export async function GET(req: NextRequest) {
  const t = await getT();
  try {
    const session = await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json({ ok: false, error: t('api.needRange') }, { status: 400 });
    }
    const target = resolveCalendarTarget(req.nextUrl.searchParams.get('memberId'), session);
    if (!target.ok) {
      return NextResponse.json({ ok: false, error: t('api.forbidden') }, { status: 403 });
    }
    const targetMemberId = target.memberId;

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
    const hours = await workHours();

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
        // A meal in progress ends in the future, so it is clamped to now rather than counting time that has not passed.
        const raw = b.endAt ?? (dayStatus === 'ON_BREAK' ? now : null);
        if (!raw) return sum;
        const endAt = raw.getTime() > now.getTime() ? now : raw;
        return sum + Math.max(0, Math.floor((endAt.getTime() - b.startAt.getTime()) / 60000));
      }, 0);
      const dayWorkedMinutes =
        dayStatus === 'DONE' ? a.workedMinutes : Math.max(0, sessionSpanMin - breakSpanMin);
      const dayBreakMinutes = dayStatus === 'DONE' ? a.breakMinutes : breakSpanMin;
      const dayOvertimeMinutes = dayStatus === 'DONE' ? a.overtimeMinutes : 0;
      a.sessions.forEach((s, idx) => {
        const endAt = s.endAt ?? now;
        const minutes = sessionMinutes[idx];
        const inLabel = formatZoned(s.startAt, 'HH:mm');
        const outLabel = s.endAt ? formatZoned(s.endAt, 'HH:mm') : t('status.inProgress');
        events.push({
          id: `sess-${s.id}`,
          title: `${inLabel} ~ ${outLabel} · ${formatDuration(t, minutes)}`,
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
            sessionId: s.id,
          },
        });
      });
    }

    for (const l of leaves) {
      if (l.type === 'FULL_DAY') {
        events.push({
          id: `leave-${l.id}`,
          title: t('evt.leaveFull'),
          start: zonedIsoFromDate(l.startDate),
          end: zonedIsoFromDate(addDaysUtc(l.endDate, 1)),
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
          hours,
        );
        const suffix = l.type === 'HALF_DAY_AM' ? t('evt.am') : t('evt.pm');
        events.push({
          id: `leave-${l.id}`,
          title: t('evt.halfPrefix', { suffix }),
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
      { ok: false, error: t('api.calendarLoadFailed') },
      { status: 500 },
    );
  }
}
