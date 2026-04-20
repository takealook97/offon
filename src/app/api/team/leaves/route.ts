import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import type { CalendarEvent } from '@/lib/api-types';

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function halfDayRange(workDate: Date, type: 'HALF_DAY_AM' | 'HALF_DAY_PM') {
  const start = new Date(workDate);
  const end = new Date(workDate);
  if (type === 'HALF_DAY_AM') {
    start.setHours(9, 0, 0, 0);
    end.setHours(13, 0, 0, 0);
  } else {
    start.setHours(13, 0, 0, 0);
    end.setHours(18, 0, 0, 0);
  }
  return { start, end };
}

function typeLabel(type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM'): string {
  if (type === 'HALF_DAY_AM') return '오전 반차';
  if (type === 'HALF_DAY_PM') return '오후 반차';
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
        const endExclusive = new Date(l.endDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return {
          id: `team-leave-${l.id}`,
          title,
          start: l.startDate.toISOString(),
          end: endExclusive.toISOString(),
          allDay: true,
          resource: {
            kind: 'LEAVE',
            leaveType: 'FULL_DAY',
            leaveStatus: 'APPROVED',
            memberName: l.member.name,
          },
        };
      }
      const range = halfDayRange(
        l.startDate,
        l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
      );
      return {
        id: `team-leave-${l.id}`,
        title,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        allDay: false,
        resource: {
          kind: 'LEAVE',
          leaveType: l.type as 'HALF_DAY_AM' | 'HALF_DAY_PM',
          leaveStatus: 'APPROVED',
          memberName: l.member.name,
        },
      };
    });

    return NextResponse.json({ events });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
