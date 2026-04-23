import { NextRequest, NextResponse } from 'next/server';
import type { LeaveType, LeaveCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
  parseDate,
  kstIsoFromDate,
  addDaysUtc,
  halfDayIsoRange,
} from '@/lib/calendar-utils';
import type { CalendarEvent } from '@/lib/api-types';

function typeLabel(type: LeaveType, category: LeaveCategory): string {
  // Public duty can only be a full day, refused at validation. Half-day labels apply to annual leave only.
  if (category === 'PUBLIC_DUTY') return 'Public duty';
  if (type === 'HALF_DAY_AM') return 'Half day (morning)';
  if (type === 'HALF_DAY_PM') return 'Half day (afternoon)';
  return 'Leave';
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json(
        { ok: false, error: 'start and end query parameters are required' },
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
      const category = l.category;
      const label = typeLabel(l.type, category);
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
            leaveCategory: category,
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
          leaveCategory: category,
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
      { ok: false, error: 'Could not load the team leave schedule' },
      { status: 500 },
    );
  }
}
