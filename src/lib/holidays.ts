import { prisma } from './prisma';

export type HolidayRow = {
  id: number;
  date: string;
  name: string;
};

function toYmdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Turns a "YYYY-MM-DD" bound into the instant a `@db.Date` column stores for that day,
 * or null if the string is not a day.
 *
 * Both queries below interpolate their bounds into a date string, so anything that is not a
 * date became an Invalid Date and Prisma rejected it at the driver — a mistyped query string
 * surfaced as a 500 rather than as a bad request. Two things are checked, because neither
 * catches the other: the shape, since `new Date('rubbishT00:00:00Z')` is Invalid; and the
 * round-trip, since `2026-02-30` is perfectly valid input that silently becomes March 2nd.
 *
 * Refusing the request belongs to the route. What belongs here is never building a query
 * that cannot run, whichever caller is asking.
 */
function toDayStart(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return toYmdUTC(d) === s ? d : null;
}

/** True if the string is a real calendar day written as "YYYY-MM-DD". */
export function isDayString(s: string | undefined | null): boolean {
  return toDayStart(s) !== null;
}

/** The holidays between two local date strings, inclusive, as a Set of "YYYY-MM-DD". */
export async function getHolidaySet(
  start: string,
  end: string,
): Promise<Set<string>> {
  const gte = toDayStart(start);
  const lte = toDayStart(end);
  if (!gte || !lte || lte < gte) return new Set();
  const rows = await prisma.holiday.findMany({
    where: { deletedAt: null, date: { gte, lte } },
    select: { date: true },
  });
  return new Set(rows.map((r) => toYmdUTC(r.date)));
}

export async function listHolidays(opts?: {
  from?: string;
  to?: string;
}): Promise<HolidayRow[]> {
  const where: {
    deletedAt: null;
    date?: { gte?: Date; lte?: Date };
  } = { deletedAt: null };
  const gte = toDayStart(opts?.from);
  const lte = toDayStart(opts?.to);
  if (gte || lte) {
    where.date = {};
    if (gte) where.date.gte = gte;
    if (lte) where.date.lte = lte;
  }
  const rows = await prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
    select: { id: true, date: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, date: toYmdUTC(r.date), name: r.name }));
}
