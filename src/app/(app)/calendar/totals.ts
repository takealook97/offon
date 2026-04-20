import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
} from 'date-fns';
import type { CalendarEvent } from '@/lib/api-types';

const WEEK_OPTS = { weekStartsOn: 0 as const };

export function attendanceMinutesIn(
  events: CalendarEvent[],
  range: { start: Date; end: Date },
): number {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return events.reduce((sum, e) => {
    if (e.resource.kind !== 'ATTENDANCE') return sum;
    const t = new Date(e.start).getTime();
    if (t < startMs || t > endMs) return sum;
    return sum + (e.resource.workedMinutes ?? 0);
  }, 0);
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

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0 && mm > 0) return `${h}시간 ${mm}분`;
  if (h > 0) return `${h}시간`;
  return `${mm}분`;
}
