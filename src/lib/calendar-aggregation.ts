import {
  clipMinutes,
  dayBoundsUtc,
  dayKey,
  nextDayKey,
} from '@/lib/time';

type SessionLite = { startAt: Date; endAt: Date | null };
type BreakLite = { startAt: Date; endAt: Date | null };

type AttendanceStatus =
  | 'NOT_STARTED'
  | 'WORKING'
  | 'ON_BREAK'
  | 'DONE'
  | 'MISSING';

export type SourceAttendance = {
  status: AttendanceStatus;
  sessions: SessionLite[];
  breaks: BreakLite[];
};

export type DailyAttendanceTotal = {
  workedMinutes: number;
  breakMinutes: number;
  attendanceStatus: 'WORKING' | 'ON_BREAK' | 'DONE';
};

const STATUS_PRIORITY: Record<DailyAttendanceTotal['attendanceStatus'], number> = {
  WORKING: 3,
  ON_BREAK: 2,
  DONE: 1,
};

function mapDayStatus(s: AttendanceStatus): DailyAttendanceTotal['attendanceStatus'] {
  if (s === 'DONE') return 'DONE';
  if (s === 'ON_BREAK') return 'ON_BREAK';
  return 'WORKING';
}

function resolveSegmentEnd(
  segEnd: Date | null,
  status: AttendanceStatus,
  now: Date,
): Date | null {
  // A meal is stored with its end already fixed in the future. Counting it as-is would
  // deduct time that has not passed yet and throw off the running total, so it is clamped
  // to now. Spans already in the past are unaffected.
  if (segEnd) return segEnd.getTime() > now.getTime() ? now : segEnd;
  if (status === 'WORKING' || status === 'ON_BREAK') return now;
  return null;
}

/**
 * Clips one member's attendance rows, and the sessions and breaks inside them, at local
 * midnight, producing per-day worked and break minutes plus a day-level status.
 *
 * - An open session or break is clamped to now only while the status is working or away.
 * - When several attendance rows touch one day the minutes are summed and the most active status wins.
 */
export function clippedDailyTotals(
  attendances: SourceAttendance[],
  now: Date,
): Record<string, DailyAttendanceTotal> {
  const out: Record<string, DailyAttendanceTotal> = {};

  const ensure = (key: string, status: DailyAttendanceTotal['attendanceStatus']) => {
    const cur = out[key];
    if (!cur) {
      out[key] = { workedMinutes: 0, breakMinutes: 0, attendanceStatus: status };
      return out[key];
    }
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[cur.attendanceStatus]) {
      cur.attendanceStatus = status;
    }
    return cur;
  };

  const enumerateDays = (
    start: Date,
    end: Date,
    visit: (key: string, dayStart: Date, dayEnd: Date) => void,
  ) => {
    if (end.getTime() <= start.getTime()) return;
    let cursor = dayKey(start);
    const endKey = dayKey(new Date(end.getTime() - 1));
    // A safety bound. Normal data takes one or two iterations; this stops a session years long from looping forever.
    for (let i = 0; i < 400; i++) {
      const { start: ds, end: de } = dayBoundsUtc(cursor);
      visit(cursor, ds, de);
      if (cursor === endKey) return;
      cursor = nextDayKey(cursor);
    }
  };

  for (const a of attendances) {
    const dayStatus = mapDayStatus(a.status);

    for (const s of a.sessions) {
      const end = resolveSegmentEnd(s.endAt, a.status, now);
      if (!end) continue;
      enumerateDays(s.startAt, end, (key, ds, de) => {
        const overlap = clipMinutes(s.startAt, end, ds, de);
        if (overlap <= 0) return;
        const t = ensure(key, dayStatus);
        t.workedMinutes += overlap;
      });
    }

    for (const b of a.breaks) {
      const end = resolveSegmentEnd(b.endAt, a.status, now);
      if (!end) continue;
      enumerateDays(b.startAt, end, (key, ds, de) => {
        const overlap = clipMinutes(b.startAt, end, ds, de);
        if (overlap <= 0) return;
        const t = ensure(key, dayStatus);
        t.breakMinutes += overlap;
        t.workedMinutes -= overlap;
      });
    }
  }

  for (const key of Object.keys(out)) {
    const t = out[key];
    if (t.workedMinutes < 0) t.workedMinutes = 0;
  }

  return out;
}
