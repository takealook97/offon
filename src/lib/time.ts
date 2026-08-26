import { format as fnsFormat } from 'date-fns';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { enUS, ko } from 'date-fns/locale';

/**
 * The timezone the organisation works in. An IANA name, defaulting to `Asia/Seoul`.
 *
 * The browser has to read the same value (calendar labels and worked-time displays are
 * recomputed client-side), hence the `NEXT_PUBLIC_` prefix. It is not a secret.
 */
export function appTimezone(): string {
  return process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Seoul';
}

/**
 * The UTC offset of `APP_TIMEZONE`, in milliseconds, at a given instant.
 *
 * Computed per instant rather than kept as a constant, because of daylight saving.
 * Korea has none and is always +9h, but European and US zones shift twice a year.
 * `Intl` carries tzdata, so this is exact with no extra dependency.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: appTimezone(),
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // With hour12:false the hour can come back as 24 (midnight). Date.UTC rolls it over.
  const asUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour'),
    at('minute'),
    at('second'),
  );
  // Sub-second precision cannot affect an offset, so drop it.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Wall-clock fields (year, month, day, hour, minute) to a UTC instant.
 *
 * The offset depends on the answer, so we measure twice and let it converge. Even at a DST transition,
 * even where a wall-clock time may not exist, or may exist twice, this settles on one stable value.
 */
function wallToUtcMs(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = zoneOffsetMs(new Date(guess));
  const second = zoneOffsetMs(new Date(guess - first));
  return guess - second;
}

/**
 * The given instant as a Date whose fields read as that timezone's wall clock.
 * On a server running in UTC this makes getUTCFullYear, getUTCHours and friends return
 * local values, by shifting the UTC epoch by the offset. Never send this Date anywhere
 * via toISOString(); use it only with format() and the get* family.
 */
function zoneShifted(d: Date = new Date()): Date {
  return new Date(d.getTime() + zoneOffsetMs(d));
}

/**
 * Moves the shifted value's UTC fields, which hold the local wall clock, into the runtime's local fields.
 * The formatter reads a Date in the local zone, so handing it the shifted value is right on a UTC runtime but
 * is shifted again on a machine in another zone. Going through this conversion,
 * always formats the org timezone's wall clock.
 */
function zoneWallClock(d: Date): Date {
  const s = zoneShifted(d);
  return new Date(
    s.getUTCFullYear(),
    s.getUTCMonth(),
    s.getUTCDate(),
    s.getUTCHours(),
    s.getUTCMinutes(),
    s.getUTCSeconds(),
    s.getUTCMilliseconds(),
  );
}

export function zonedNow(): Date {
  return zoneShifted();
}

/**
 * Midnight UTC of **today's date** in the org timezone.
 *
 * `@db.Date` columns (workDate, startDate, endDate) are stored as midnight UTC, so
 * anything compared against them, or written to them, needs the same shape.
 *
 * This used to be `startOfDay(zonedNow())`. But `zonedNow()` is already shifted to the
 * wall clock and `startOfDay` truncates in the **runtime** timezone, so the answer
 * depended on which zone the server happened to run in: correct on Vercel (UTC), a day
 * ahead on a machine in KST after 15:00, where leave requested for today was refused as
 * being in the past. Removing exactly this is why the timezone was made configurable.
 */
export function zonedToday(): Date {
  return new Date(`${todayKey()}T00:00:00Z`);
}

/** Today's `yyyy-MM-dd` in the org timezone. Use this wherever a date string is needed. */
export function todayKey(): string {
  return dayKey(new Date());
}

/**
 * Formats against the local wall clock. Formats with weekday or month names take a locale.
 * It defaults to the primary locale because most callers use numeric-only formats.
 */
export function formatZoned(
  d: Date,
  fmt = 'yyyy-MM-dd HH:mm',
  locale: 'ko' | 'en' = 'ko',
): string {
  return fnsFormat(zoneWallClock(d), fmt, { locale: locale === 'en' ? enUS : ko });
}

export function weekRange(ref: Date = zonedNow()): { start: Date; end: Date } {
  return {
    start: startOfWeek(ref, { weekStartsOn: 0 }),
    end: endOfWeek(ref, { weekStartsOn: 0 }),
  };
}

export function monthRange(ref: Date = zonedNow()): { start: Date; end: Date } {
  return {
    start: startOfMonth(ref),
    end: endOfMonth(ref),
  };
}

export function isWeekday(d: Date = new Date()): boolean {
  // The shift is applied internally, so the argument must be a real UTC instant.
  // Defaulting to an already-shifted value shifts it again and pushes the weekday forward by a day.
  // Friday afternoon read as Saturday, so the clock-out cron skipped a weekday evening.
  const dow = zoneShifted(d).getDay();
  return dow >= 1 && dow <= 5;
}

/** The year (`YYYY`) in the org timezone. */
export function zonedYear(d: Date = new Date()): number {
  return zoneShifted(d).getUTCFullYear();
}

/** `{ month: 1..12, day: 1..31 }` in the org timezone. */
export function zonedMonthDay(d: Date = new Date()): { month: number; day: number } {
  const shifted = zoneShifted(d);
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
export function isWeekendDateStr(s: string): boolean {
  const dow = new Date(`${s}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Weekdays (Mon-Fri) between `start` and `end` inclusive, in the org timezone.
 * Both arguments are `YYYY-MM-DD` strings; returns 0 when end < start.
 *
 * Weekdays are timezone-independent, so we step forward from midnight UTC.
 * Starting there leaves no room for DST or a leap second inside a 24h step.
 */
export function countWeekdays(start: string, end: string): number {
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
export function isBusinessDayDateStr(
  s: string,
  holidays: ReadonlySet<string>,
): boolean {
  if (isWeekendDateStr(s)) return false;
  return !holidays.has(s);
}

/** Like `countWeekdays`, but also excludes holidays (a Set of "YYYY-MM-DD"). */
export function countBusinessDays(
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

/**
 * An absolute instant to the local `yyyy-MM-dd` string.
 * Daily totals are clipped at local midnight, so every day-key conversion goes through here.
 */
export function dayKey(d: Date): string {
  // Passing the shifted Date straight in has the formatter read it in the runtime's local zone,
  // shifting it again, so the day key lands a day off and totals attach to the wrong date.
  // Going through the wall-clock conversion, as the formatter does, makes this independent of the runtime timezone.
  // On a UTC runtime the behaviour is identical either way.
  return fnsFormat(zoneWallClock(d), 'yyyy-MM-dd');
}

/**
 * A `yyyy-MM-dd` string to that day's [00:00, next 00:00) as UTC instants.
 * In Asia/Seoul, `'2026-04-30'` gives `{ 2026-04-29T15:00Z, 2026-04-30T15:00Z }`.
 *
 * The end is the next midnight rather than start + 24h because of DST: a day with a
 * transition in it is 23 or 25 hours long, so adding 24h misplaces the boundary.
 */
export function dayBoundsUtc(key: string): { start: Date; end: Date } {
  const [y, m, d] = key.split('-').map(Number);
  const start = new Date(wallToUtcMs(y, m, d, 0, 0));
  const nextKey = nextDayKey(key);
  const [ny, nm, nd] = nextKey.split('-').map(Number);
  const end = new Date(wallToUtcMs(ny, nm, nd, 0, 0));
  return { start, end };
}

/**
 * A wall-clock string to a UTC instant.
 * `'2026-05-01T09:00'` or `'2026-05-01 09:00'` in the org timezone gives `2026-05-01T00:00:00Z`.
 * Used to turn a datetime-local input, which carries no timezone, into an instant to store.
 * Returns an Invalid Date on a malformed string; callers check with isNaN.
 */
export function wallToUtc(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  return new Date(wallToUtcMs(y, mo, d, h, mi));
}

/** A UTC instant to the `'yyyy-MM-ddTHH:mm'` wall clock a datetime-local input expects. */
export function utcToWall(d: Date): string {
  return fnsFormat(zoneWallClock(d), "yyyy-MM-dd'T'HH:mm");
}

/** The day key after a local `yyyy-MM-dd`. `Date.UTC` normalises month, year and leap days. */
export function nextDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** Minutes in [segStart, segEnd] intersected with [dayStart, dayEnd] (floored, never negative). */
export function clipMinutes(
  segStart: Date,
  segEnd: Date,
  dayStart: Date,
  dayEnd: Date,
): number {
  const s = Math.max(segStart.getTime(), dayStart.getTime());
  const e = Math.min(segEnd.getTime(), dayEnd.getTime());
  if (e <= s) return 0;
  return Math.floor((e - s) / 60000);
}

/** Local `HH:mm`, independent of the runtime timezone. fnsFormat would read the Date in the local zone and double-shift it on a client already in the org zone, so the UTC getters are used directly. */
function zonedHhMm(d: Date): string {
  const shifted = zoneShifted(d);
  const h = String(shifted.getUTCHours()).padStart(2, '0');
  const m = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * The display label for a session segment clipped to one local day.
 * - segEnd === null means an open session; `now` is assumed as its end before clipping.
 * - A clipped start on midnight gives `'00:00'`: it carried over from the previous day.
 * - A clipped end on the next midnight gives `'24:00'`: it carries into the next day, or is still open.
 * - Still open and ending before the next midnight gives the in-progress label.
 */
export function clipSegmentLabel(
  segStart: Date,
  segEnd: Date | null,
  dayKey: string,
  /** openLabel: what to show for a segment that has not ended. This file is a pure time utility and knows nothing of the dictionary. */
  opts: { now: Date; openLabel: string },
): { startLabel: string; endLabel: string; minutes: number } {
  const isOpen = segEnd === null;
  const effectiveEnd = segEnd ?? opts.now;
  const openLabel = opts.openLabel;
  const { start: ds, end: de } = dayBoundsUtc(dayKey);
  const clipStartMs = Math.max(segStart.getTime(), ds.getTime());
  const clipEndMs = Math.min(effectiveEnd.getTime(), de.getTime());
  const minutes = clipEndMs > clipStartMs ? Math.floor((clipEndMs - clipStartMs) / 60000) : 0;
  const startLabel = clipStartMs === ds.getTime() ? '00:00' : zonedHhMm(new Date(clipStartMs));
  let endLabel: string;
  if (clipEndMs === de.getTime()) {
    endLabel = '24:00';
  } else if (isOpen) {
    endLabel = openLabel;
  } else {
    endLabel = zonedHhMm(new Date(clipEndMs));
  }
  return { startLabel, endLabel, minutes };
}

/**
 * An instant to a "grid Date", whose local fields match the org timezone's wall clock.
 *
 * react-big-calendar picks a cell from the **local** fields of the Date it is handed. Passing the real instant
 * places events in the viewer's browser timezone, which then disagrees with the labels the server
 * built in the org timezone: seen from another zone, everything sits a day off.
 *
 * This Date is for placement on screen only. Never store it or send it via toISOString().
 */
export function toGridDate(instant: Date): Date {
  return zoneWallClock(instant);
}

/** The inverse of `toGridDate`: reads a grid Date's local fields as a wall clock and returns the instant. */
export function fromGridDate(gridDate: Date): Date {
  return new Date(
    wallToUtcMs(
      gridDate.getFullYear(),
      gridDate.getMonth() + 1,
      gridDate.getDate(),
      gridDate.getHours(),
      gridDate.getMinutes(),
    ),
  );
}

/** 'Now' in the org timezone as a grid Date. The grid's today marker follows this. */
export function gridNow(): Date {
  return toGridDate(new Date());
}
