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

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const start = parseDate(req.nextUrl.searchParams.get('start'));
    const end = parseDate(req.nextUrl.searchParams.get('end'));
    if (!start || !end) {
      return NextResponse.json({ ok: false, error: 'start, end 쿼리가 필요합니다' }, { status: 400 });
    }
    const memberIdRaw = req.nextUrl.searchParams.get('memberId');
    const parsedMemberId = memberIdRaw ? Number(memberIdRaw) : null;
    const targetMemberId =
      parsedMemberId && Number.isInteger(parsedMemberId) && parsedMemberId > 0
        ? parsedMemberId
        : session.memberId;

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
      for (const s of a.sessions) {
        const endAt = s.endAt ?? now;
        const minutes = Math.max(
          0,
          Math.floor((endAt.getTime() - s.startAt.getTime()) / 60000),
        );
        const inLabel = formatKST(s.startAt, 'HH:mm');
        const outLabel = s.endAt ? formatKST(s.endAt, 'HH:mm') : '진행 중';
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
        events.push({
          id: `leave-${l.id}`,
          title: '연차(종일)',
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
        const suffix = l.type === 'HALF_DAY_AM' ? '(오전)' : '(오후)';
        events.push({
          id: `leave-${l.id}`,
          title: `반차${suffix}`,
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

    return NextResponse.json({ events });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
