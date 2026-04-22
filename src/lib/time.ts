import { format as fnsFormat } from 'date-fns';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';

// The app is pinned to one timezone with no daylight saving, handled as a fixed offset.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * The given instant as a Date whose fields read as the local wall clock.
 * On a server whose clock is UTC, this makes the Date getters return local values by
 * shifting the UTC epoch by the offset. Never send this Date anywhere via toISOString();
 * via toISOString(); use it only with format() and the get* family.
 */
function kstShifted(d: Date = new Date()): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

export function nowKST(): Date {
  return kstShifted();
}

export function todayKST(): Date {
  return startOfDay(nowKST());
}

export function formatKST(d: Date, fmt = 'yyyy-MM-dd HH:mm'): string {
  return fnsFormat(kstShifted(d), fmt, { locale: ko });
}

export function weekRangeKST(ref: Date = nowKST()): { start: Date; end: Date } {
  return {
    start: startOfWeek(ref, { weekStartsOn: 0 }),
    end: endOfWeek(ref, { weekStartsOn: 0 }),
  };
}

export function monthRangeKST(ref: Date = nowKST()): { start: Date; end: Date } {
  return {
    start: startOfMonth(ref),
    end: endOfMonth(ref),
  };
}

export function isWeekdayKST(d: Date = nowKST()): boolean {
  const dow = kstShifted(d).getDay();
  return dow >= 1 && dow <= 5;
}

/** The year in the org timezone. */
export function kstYear(d: Date = new Date()): number {
  return kstShifted(d).getUTCFullYear();
}

/** `{ month: 1..12, day: 1..31 }` in the org timezone. */
export function kstMonthDay(d: Date = new Date()): { month: number; day: number } {
  const shifted = kstShifted(d);
  return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/**
 * Whether a `YYYY-MM-DD` string falls on a weekend in the org timezone.
 *
 * The weekday of a calendar date does not depend on a timezone: 2026-04-25 is a
 * Saturday everywhere. So we parse at midnight UTC and read `getUTCDay()`.
 * (Parsing as `+09:00` used to pull the epoch back to 15:00Z the previous day, so
 *  `getUTCDay()` returned the **previous** weekday, a one-day shift bug.)
 * 0 = Sunday, 6 = Saturday.
 */
export function isWeekendKSTDateStr(s: string): boolean {
  const dow = new Date(`${s}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Weekdays between start and end inclusive, in the org timezone.
 * Both arguments are `YYYY-MM-DD` strings; returns 0 when end < start.
 *
 * Weekdays are timezone-independent, so we step forward from midnight UTC.
 * Starting there leaves no room for DST or a leap second inside a 24h step.
 */
export function countWeekdaysKST(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  if (e.getTime() < s.getTime()) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  let count = 0;
  for (let t = s.getTime(); t <= e.getTime(); t += dayMs) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** A weekend or a public holiday is not a business day. */
export function isBusinessDayKSTDateStr(
  s: string,
  holidays: ReadonlySet<string>,
): boolean {
  if (isWeekendKSTDateStr(s)) return false;
  return !holidays.has(s);
}

/** Like the weekday count, but also excludes holidays. */
export function countBusinessDaysKST(
  start: string,
  end: string,
  holidays: ReadonlySet<string>,
): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  if (e.getTime() < s.getTime()) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  let count = 0;
  for (let t = s.getTime(); t <= e.getTime(); t += dayMs) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const key = d.toISOString().slice(0, 10);
    if (holidays.has(key)) continue;
    count++;
  }
  return count;
}
