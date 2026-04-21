import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
  parseDate,
  kstIsoFromDate,
  addDaysUtc,
  halfDayIsoRange,
} from '@/lib/calendar-utils';
import type { CalendarEvent } from '@/lib/api-types';

function typeLabel(type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM'): string {
  if (type === 'HALF_DAY_AM') return '반차(오전)';
  if (type === 'HALF_DAY_PM') return '반차(오후)';
  return '연차';
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json(
        { ok: false, error: 'start, end 쿼리가 필요합니다' },
        { status: 400 },
      );
    }

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: end },
        endDate: { gte: start },
        deletedAt: null,
      },
      include: { member: { select: { name: true } } },
      orderBy: [{ startDate: 'asc' }, { memberId: 'asc' }],
    });

    const events: CalendarEvent[] = leaves.map((l) => {
      const label = typeLabel(l.type);
      const title = `${l.member.name} ${label}`;
      if (l.type === 'FULL_DAY') {
        return {
          id: `team-leave-${l.id}`,
          title,
          start: kstIsoFromDate(l.startDate),
          end: kstIsoFromDate(addDaysUtc(l.endDate, 1)),
          allDay: true,
          resource: {
            kind: 'LEAVE',
            leaveType: 'FULL_DAY',
            leaveStatus: 'APPROVED',
            memberName: l.member.name,
          },
        };
      }
      const range = halfDayIsoRange(
        l.startDate,
        l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
      );
      return {
        id: `team-leave-${l.id}`,
        title,
        start: range.start,
        end: range.end,
        allDay: false,
        resource: {
          kind: 'LEAVE',
          leaveType: l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
          leaveStatus: 'APPROVED',
          memberName: l.member.name,
        },
      };
    });

    return NextResponse.json({ ok: true, events });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[team/leaves] failed', e);
    return NextResponse.json(
      { ok: false, error: '팀 연차 일정을 불러오지 못했습니다' },
      { status: 500 },
    );
  }
}
