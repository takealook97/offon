import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import type { CalendarEvent } from '@/lib/api-types';

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

function kstIsoFromDate(d: Date, h = 0, min = 0): string {
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${y}-${m}-${day}T${pad(h)}:${pad(min)}:00+09:00`;
}

function addDaysUtc(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function halfDayIsoRange(workDate: Date, type: 'HALF_DAY_AM' | 'HALF_DAY_PM') {
  if (type === 'HALF_DAY_AM') {
    return { start: kstIsoFromDate(workDate, 9), end: kstIsoFromDate(workDate, 13) };
  }
  return { start: kstIsoFromDate(workDate, 13), end: kstIsoFromDate(workDate, 18) };
}

function typeLabel(type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM'): string {
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

    return NextResponse.json({ events });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
