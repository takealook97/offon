import { wallToUtc } from './time';

export function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Reads the **calendar date** of a Date loaded from a `@db.Date` column as a wall-clock
 * time in the org timezone, and returns the ISO string of the resulting instant.
 *
 * Prisma reads a `@db.Date` as midnight UTC, so its UTC getters are the calendar date.
 *
 * This was called kstIsoFromDate and wrote a fixed offset straight into the string. The file was
 * missed when the timezone was made configurable. The calendar client
 * takes the **instant** and places it on the org timezone's wall clock,
 * so for any organisation outside Seoul leave landed wrong entirely: in America/New_York
 * a full day of leave appeared a day early and a morning half day ran from 8pm the previous evening.
 */
export function zonedIsoFromDate(d: Date, h = 0, min = 0): string {
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return wallToUtc(`${y}-${m}-${day}T${pad(h)}:${pad(min)}`).toISOString();
}

export function addDaysUtc(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

/**
 * The span a half day occupies on the calendar.
 *
 * The working hours are not a setting yet and are fixed here. This is display
 * It is display only and is not used for the balance or for approval.
 */
export function halfDayIsoRange(workDate: Date, type: 'HALF_DAY_AM' | 'HALF_DAY_PM') {
  if (type === 'HALF_DAY_AM') {
    return { start: zonedIsoFromDate(workDate, 9), end: zonedIsoFromDate(workDate, 13) };
  }
  return { start: zonedIsoFromDate(workDate, 13), end: zonedIsoFromDate(workDate, 18) };
}
