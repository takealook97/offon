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

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json({ ok: false, error: 'start, end 쿼리가 필요합니다' }, { status: 400 });
    }

    const [attendances, leaves] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          memberId: session.memberId,
          workDate: { gte: start, lte: end },
          deletedAt: null,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          memberId: session.memberId,
          status: { in: ['REQUESTED', 'APPROVED'] },
          startDate: { lte: end },
          endDate: { gte: start },
          deletedAt: null,
        },
      }),
    ]);

    const events: CalendarEvent[] = [];

    for (const a of attendances) {
      if (a.status === 'MISSING') {
        events.push({
          id: `missing-${a.id}`,
          title: '근태 누락',
          start: a.workDate.toISOString(),
          end: a.workDate.toISOString(),
          allDay: true,
          resource: { kind: 'MISSING' },
        });
        continue;
      }
      if (!a.clockInAt) continue;
      const startIso = a.clockInAt.toISOString();
      const endIso = a.clockOutAt?.toISOString() ?? a.clockInAt.toISOString();
      const inLabel = formatKST(a.clockInAt, 'HH:mm');
      const outLabel = a.clockOutAt ? formatKST(a.clockOutAt, 'HH:mm') : '진행 중';
      events.push({
        id: `att-${a.id}`,
        title: `${inLabel} ~ ${outLabel} (${a.workedMinutes}분)`,
        start: startIso,
        end: endIso,
        allDay: false,
        resource: {
          kind: 'ATTENDANCE',
          workedMinutes: a.workedMinutes,
          overtimeMinutes: a.overtimeMinutes,
          attendanceStatus: a.status === 'WORKING' ? 'WORKING' : 'DONE',
        },
      });
    }

    for (const l of leaves) {
      if (l.type === 'FULL_DAY') {
        const endExclusive = new Date(l.endDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        events.push({
          id: `leave-${l.id}`,
          title: l.status === 'REQUESTED' ? '[대기] 연차(종일)' : '연차(종일)',
          start: l.startDate.toISOString(),
          end: endExclusive.toISOString(),
          allDay: true,
          resource: {
            kind: 'LEAVE',
            leaveType: 'FULL_DAY',
            leaveStatus: l.status === 'REQUESTED' ? 'REQUESTED' : 'APPROVED',
          },
        });
      } else {
        const { start: s, end: e } = halfDayRange(
          l.startDate,
          l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
        );
        const suffix = l.type === 'HALF_DAY_AM' ? '(오전)' : '(오후)';
        events.push({
          id: `leave-${l.id}`,
          title: l.status === 'REQUESTED' ? `[대기] 연차${suffix}` : `연차${suffix}`,
          start: s.toISOString(),
          end: e.toISOString(),
          allDay: false,
          resource: {
            kind: 'LEAVE',
            leaveType: l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
            leaveStatus: l.status === 'REQUESTED' ? 'REQUESTED' : 'APPROVED',
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
