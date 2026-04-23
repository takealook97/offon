import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireAdmin } from '@/lib/session';
import { formatKST } from '@/lib/time';
import {
  parseDate,
  kstIsoFromDate,
  addDaysUtc,
  halfDayIsoRange,
} from '@/lib/calendar-utils';
import type { CalendarEvent } from '@/lib/api-types';

const LUNCH_DEDUCTION_THRESHOLD_MINUTES = 300;
const LUNCH_DEDUCTION_MINUTES = 60;

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
    const requestedMemberId =
      parsedMemberId && Number.isInteger(parsedMemberId) && parsedMemberId > 0
        ? parsedMemberId
        : session.memberId;
    // Only an admin may look up somebody else, which is what stops an insecure direct reference
    if (requestedMemberId !== session.memberId) {
      await requireAdmin();
    }
    const targetMemberId = requestedMemberId;

    const [attendances, leaves] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          memberId: targetMemberId,
          workDate: { gte: start, lte: end },
          deletedAt: null,
        },
        include: {
          sessions: { where: { deletedAt: null }, orderBy: { startAt: 'asc' } },
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
      const rawMinutesPerSession = a.sessions.map((s) => {
        const endAt = s.endAt ?? now;
        return Math.max(
          0,
          Math.floor((endAt.getTime() - s.startAt.getTime()) / 60000),
        );
      });
      const dayRawTotal = rawMinutesPerSession.reduce((sum, m) => sum + m, 0);
      const dayDeduction =
        dayRawTotal >= LUNCH_DEDUCTION_THRESHOLD_MINUTES ? LUNCH_DEDUCTION_MINUTES : 0;
      const lastIdx = a.sessions.length - 1;
      a.sessions.forEach((s, idx) => {
        const endAt = s.endAt ?? now;
        const minutes = rawMinutesPerSession[idx];
        const workedMinutes =
          idx === lastIdx ? Math.max(0, minutes - dayDeduction) : minutes;
        const inLabel = formatKST(s.startAt, 'HH:mm');
        const outLabel = s.endAt ? formatKST(s.endAt, 'HH:mm') : 'In progress';
        events.push({
          id: `sess-${s.id}`,
          title: `${inLabel} ~ ${outLabel} · ${formatDuration(workedMinutes)}`,
          start: s.startAt.toISOString(),
          end: endAt.toISOString(),
          allDay: false,
          resource: {
            kind: 'ATTENDANCE',
            workedMinutes,
            overtimeMinutes: 0,
            attendanceStatus: s.endAt ? 'DONE' : 'WORKING',
          },
        });
      });
    }

    for (const l of leaves) {
      const category = l.category;
      const isPublicDuty = category === 'PUBLIC_DUTY';
      if (l.type === 'FULL_DAY') {
        const title = isPublicDuty ? 'Public duty' : 'Leave';
        events.push({
          id: `leave-${l.id}`,
          title,
          start: kstIsoFromDate(l.startDate),
          end: kstIsoFromDate(addDaysUtc(l.endDate, 1)),
          allDay: true,
          resource: {
            kind: 'LEAVE',
            leaveType: 'FULL_DAY',
            leaveCategory: category,
            leaveStatus: 'APPROVED',
          },
        });
      } else {
        const { start: s, end: e } = halfDayIsoRange(
          l.startDate,
          l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
        );
        const suffix = l.type === 'HALF_DAY_AM' ? '(morning)' : '(afternoon)';
        // Public duty can only be a full day, refused at validation. Legacy rows fall back to the plain label.
        const title = isPublicDuty ? 'Public duty' : `Half day${suffix}`;
        events.push({
          id: `leave-${l.id}`,
          title,
          start: s,
          end: e,
          allDay: false,
          resource: {
            kind: 'LEAVE',
            leaveType: l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
            leaveCategory: category,
            leaveStatus: 'APPROVED',
          },
        });
      }
    }

    return NextResponse.json({ ok: true, events });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events] failed', e);
    return NextResponse.json(
      { ok: false, error: 'Could not load the calendar events' },
      { status: 500 },
    );
  }
}
