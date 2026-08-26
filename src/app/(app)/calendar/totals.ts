import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  format,
} from 'date-fns';
import type { DailyAttendanceTotal } from '@/lib/api-types';

const WEEK_OPTS = { weekStartsOn: 0 as const };

/**
 * Enumerates the day keys in the range and sums the worked minutes from dailyTotals.
 * Those totals arrive from `/api/calendar/events` already clipped at local midnight, so a
 * session crossing midnight is split correctly across both days.
 */
export function attendanceMinutesIn(
  dailyTotals: Record<string, DailyAttendanceTotal>,
  range: { start: Date; end: Date },
): number {
  // The range comes from the calendar's grid dates, whose local fields are the org's wall
  // clock, so reading the local date here gives the org's day key whatever zone the viewer
  // is in. Do not swap these for the UTC getters.
  const cur = new Date(
    range.start.getFullYear(),
    range.start.getMonth(),
    range.start.getDate(),
  );
  const last = new Date(
    range.end.getFullYear(),
    range.end.getMonth(),
    range.end.getDate(),
  );
  let total = 0;
  while (cur.getTime() <= last.getTime()) {
    const key = format(cur, 'yyyy-MM-dd');
    total += dailyTotals[key]?.workedMinutes ?? 0;
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

export function rangeForView(
  view: 'month' | 'week' | 'day',
  date: Date,
): { start: Date; end: Date } {
  if (view === 'month') return { start: startOfMonth(date), end: endOfMonth(date) };
  if (view === 'week')
    return { start: startOfWeek(date, WEEK_OPTS), end: endOfWeek(date, WEEK_OPTS) };
  return { start: startOfDay(date), end: endOfDay(date) };
}

export function weeksInMonth(date: Date): { start: Date; end: Date }[] {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachWeekOfInterval({ start, end }, WEEK_OPTS).map((w) => ({
    start: startOfWeek(w, WEEK_OPTS),
    end: endOfWeek(w, WEEK_OPTS),
  }));
}

