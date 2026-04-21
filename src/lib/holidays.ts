import { prisma } from './prisma';

export type HolidayRow = {
  id: number;
  date: string;
  name: string;
};

function toYmdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The holidays between two local date strings, inclusive, as a Set of "YYYY-MM-DD". */
export async function getHolidaySet(
  start: string,
  end: string,
): Promise<Set<string>> {
  if (!start || !end || end < start) return new Set();
  const rows = await prisma.holiday.findMany({
    where: {
      deletedAt: null,
      date: {
        gte: new Date(`${start}T00:00:00Z`),
        lte: new Date(`${end}T00:00:00Z`),
      },
    },
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
  if (opts?.from || opts?.to) {
    where.date = {};
    if (opts.from) where.date.gte = new Date(`${opts.from}T00:00:00Z`);
    if (opts.to) where.date.lte = new Date(`${opts.to}T00:00:00Z`);
  }
  const rows = await prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
    select: { id: true, date: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, date: toYmdUTC(r.date), name: r.name }));
}
