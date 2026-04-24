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
  // Every session event of a day carries the same day-level worked minutes.
  // Summed once per day rather than once per session, or the total is wrong.
  const perDay = new Map<string, number>();
  for (const e of events) {
    if (e.resource.kind !== 'ATTENDANCE') continue;
    const d = new Date(e.start);
    const t = d.getTime();
    if (t < startMs || t > endMs) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!perDay.has(key)) perDay.set(key, e.resource.workedMinutes ?? 0);
  }
  let total = 0;
  for (const v of perDay.values()) total += v;
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

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0 && mm > 0) return `${h}h ${mm}m`;
  if (h > 0) return `${h}h`;
  return `${mm}m`;
}
