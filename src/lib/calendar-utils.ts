import { wallToUtc } from './time';
import { DEFAULT_WORK_HOURS, halfDayBounds, type WorkHours } from './work-hours';

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
 * This was called `kstIsoFromDate` and wrote `+09:00` straight into the string. The file
 * was missed when the timezone was made configurable. The calendar client takes the
 * **instant** via `toGridDate(new Date(e.start))` and places it on the org's wall clock, so
 * for any organisation outside Seoul leave landed in the wrong place entirely: in
 * America/New_York a full day of leave appeared a day early, and a morning half day was
 * drawn from 8pm the previous evening to midnight.
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
 * The times derive from the org's working-hours setting; 09, 13 and 18 used to be written
 * out here. Omitting the argument uses the default hours, which produces the same values.
 */
export function halfDayIsoRange(
  workDate: Date,
  type: 'HALF_DAY_AM' | 'HALF_DAY_PM',
  hours: WorkHours = DEFAULT_WORK_HOURS,
) {
  const { startMinutes, endMinutes } = halfDayBounds(hours, type);
  const at = (m: number) => zonedIsoFromDate(workDate, Math.floor(m / 60), m % 60);
  return { start: at(startMinutes), end: at(endMinutes) };
}
