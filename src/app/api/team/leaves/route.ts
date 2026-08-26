import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
  parseDate,
  zonedIsoFromDate,
  addDaysUtc,
  halfDayIsoRange,
} from '@/lib/calendar-utils';
import type { CalendarEvent } from '@/lib/api-types';
import { getT } from '@/lib/i18n/server';
import type { MessageKey } from '@/lib/i18n/dictionary';

function typeKey(type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM'): MessageKey {
  if (type === 'HALF_DAY_AM') return 'evt.halfAm';
  if (type === 'HALF_DAY_PM') return 'evt.halfPm';
  return 'appr.leave';
}

export async function GET(req: NextRequest) {
  const t = await getT();
  try {
    await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json(
        { ok: false, error: t('api.needRange') },
        { status: 400 },
      );
    }

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: end },
        endDate: { gte: start },
        deletedAt: null,
        member: { deletedAt: null },
      },
      include: { member: { select: { name: true } } },
      orderBy: [{ startDate: 'asc' }, { memberId: 'asc' }],
    });

    const events: CalendarEvent[] = leaves.map((l) => {
      const label = t(typeKey(l.type));
      const title = `${l.member.name} ${label}`;
      if (l.type === 'FULL_DAY') {
        return {
          id: `team-leave-${l.id}`,
          title,
          start: zonedIsoFromDate(l.startDate),
          end: zonedIsoFromDate(addDaysUtc(l.endDate, 1)),
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

    return NextResponse.json({ ok: true, events, dailyTotals: {} });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[team/leaves] failed', e);
    return NextResponse.json(
      { ok: false, error: t('api.teamLeaveFailed') },
      { status: 500 },
    );
  }
}
