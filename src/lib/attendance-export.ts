import { prisma } from './prisma';
import {
  kstDayKey,
  kstYear,
  kstMonthDay,
  nextKstDayKey,
  isBusinessDayKSTDateStr,
} from './time';
import { getHolidaySet } from './holidays';
import { clippedDailyTotals, type SourceAttendance } from './calendar-aggregation';

/** The standard working minutes for one weekday. */
const STANDARD_DAY_MINUTES = 480;
/** The half-day credit. */
const HALF_DAY_CREDIT_MINUTES = 240;
/** The first month this feature was live. Nothing exists before it. */
const FEATURE_START_YEAR = 2026;
const FEATURE_START_MONTH = 5;
/** An upper bound guarding clippedDailyTotals against runaway data: a month plus slack. */
const MAX_ENUMERATE_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, '0');

type PrismaLeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

export type LeaveLabel = 'Leave' | 'Morning half day' | 'Afternoon half day' | '';

export type DailyRow = {
/** The displayed date, e.g. '2026.05.26 (Tue)'. */
  date: string;
  /** Time on the clock: net work plus breaks, in minutes. */
  workMinutes: number;
  /** Break minutes. */
  breakMinutes: number;
  /** True on a weekend or public holiday. */
  isHoliday: boolean;
  /** The leave or half-day label, or '' when there is none. */
  leaveLabel: LeaveLabel;
  /** Credited minutes: a standard day for full leave, net work plus the half-day credit for a half day, otherwise net work. */
  sumMinutes: number;
};

export type ReportSummary = {
  /** The baseline: business days times the standard day. */
  baselineMinutes: number;
  /** Credited minutes across business days. */
  weekdaySumMinutes: number;
  /** Weekday overtime: credited weekday minutes minus the baseline. May be negative. */
  overtimeMinutes: number;
  /** Credited minutes on weekends and holidays. */
  holidaySumMinutes: number;
  /** Everything credited: weekdays plus holidays. */
  totalSumMinutes: number;
};

export type IndividualReport = {
  member: { id: number; name: string; position: string | null };
  yyyymm: string;
  rows: DailyRow[];
  summary: ReportSummary;
};

export type OrgReportRow = {
  name: string;
  position: string | null;
  summary: ReportSummary;
};

export type OrgReport = {
  yyyymm: string;
  rows: OrgReportRow[];
};

export type ResolvedMonthRange = {
  year: number;
  month: number;
  yyyymm: string;
  startKey: string;
  endKey: string;
  dayKeys: string[];
};

export type MonthRange = { ok: false; error: string } | ({ ok: true } & ResolvedMonthRange);

type FetchedLeave = { type: PrismaLeaveType; startDate: Date; endDate: Date };

/** The day key before a given one. */
function prevDayKey(key: string): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** A day key as a display string with its weekday. The weekday itself is timezone-independent. */
function formatDateLabel(key: string): string {
  const dow = WEEKDAY_KO[new Date(`${key}T00:00:00Z`).getUTCDay()];
  return `${key.replace(/-/g, '.')} (${dow})`;
}

/** Every day key from startKey to endKey inclusive. Empty when endKey precedes startKey. */
function enumerateKeys(startKey: string, endKey: string): string[] {
  if (endKey < startKey) return [];
  const out: string[] = [];
  let cur = startKey;
  for (let i = 0; i < MAX_ENUMERATE_DAYS; i++) {
    out.push(cur);
    if (cur === endKey) break;
    cur = nextKstDayKey(cur);
  }
  return out;
}

/**
 * Validates the chosen year and month and works out the range to export.
 * - Start: the first of that month.
 * - End: the earlier of the last day and yesterday. Today is still in progress and is left out of both.
 *   so the current month runs to yesterday and any past month runs to its last day.
 * - Months before the feature started, and months in the future, are refused.
 */
export function resolveMonthRange(year: number, month: number, now: Date): MonthRange {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: 'That year or month is not valid' };
  }
  const beforeStart =
    year < FEATURE_START_YEAR ||
    (year === FEATURE_START_YEAR && month < FEATURE_START_MONTH);
  if (beforeStart) {
    return {
      ok: false,
      error: `Exports start from ${FEATURE_START_MONTH}/${FEATURE_START_YEAR}`,
    };
  }
  const curYear = kstYear(now);
  const curMonth = kstMonthDay(now).month;
  const inFuture = year > curYear || (year === curYear && month > curMonth);
  if (inFuture) {
    return { ok: false, error: 'A month in the future cannot be chosen' };
  }

  const yyyymm = `${year}${pad2(month)}`;
  const startKey = `${year}-${pad2(month)}-01`;
  // Date.UTC(year, month, 0) with a zero-based month index gives the last day of the chosen month.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayKey = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;
  // Today is excluded, so the end is the earlier of the last day and yesterday.
  const yesterdayKey = prevDayKey(kstDayKey(now));
  const endKey = lastDayKey < yesterdayKey ? lastDayKey : yesterdayKey;
  const dayKeys = enumerateKeys(startKey, endKey);

  return { ok: true, year, month, yyyymm, startKey, endKey, dayKeys };
}

/** Approved leave mapped from day key to type, with full days winning over half days. */
function buildLeaveMap(
  leaves: FetchedLeave[],
  startKey: string,
  endKey: string,
): Map<string, PrismaLeaveType> {
  const map = new Map<string, PrismaLeaveType>();
  for (const l of leaves) {
    // A @db.Date is midnight UTC, so the first ten characters of toISOString are the calendar date.
    const ls0 = l.startDate.toISOString().slice(0, 10);
    const le0 = l.endDate.toISOString().slice(0, 10);
    const ls = ls0 < startKey ? startKey : ls0;
    const le = le0 > endKey ? endKey : le0;
    for (const k of enumerateKeys(ls, le)) {
      const existing = map.get(k);
      if (existing === 'FULL_DAY') continue;
      if (l.type === 'FULL_DAY' || !existing) map.set(k, l.type);
    }
  }
  return map;
}

function leaveLabelFor(t: PrismaLeaveType | undefined): LeaveLabel {
  if (t === 'FULL_DAY') return 'Leave';
  if (t === 'HALF_DAY_AM') return 'Morning half day';
  if (t === 'HALF_DAY_PM') return 'Afternoon half day';
  return '';
}

/**
 * The daily rows and summary for one member. Shared by the per-person sheet and the org sheet.
 * - Time on the clock is net work plus breaks; credited minutes are net work plus any leave credit.
 */
function computeReport(
  attendances: SourceAttendance[],
  leaves: FetchedLeave[],
  range: ResolvedMonthRange,
  holidays: ReadonlySet<string>,
  now: Date,
): { rows: DailyRow[]; summary: ReportSummary } {
  const daily = clippedDailyTotals(attendances, now);
  const leaveMap = buildLeaveMap(leaves, range.startKey, range.endKey);

  const rows: DailyRow[] = [];
  let weekdaySum = 0;
  let holidaySum = 0;
  let baselineMinutes = 0; // the per-business-day baseline, accumulated

  // range.dayKeys already stops at yesterday, so the daily table and the totals cover the same span.
  for (const key of range.dayKeys) {
    const d = daily[key];
    const net = d?.workedMinutes ?? 0;
    const brk = d?.breakMinutes ?? 0;
    const gross = net + brk;
    const leaveType = leaveMap.get(key);
    const isHoliday = !isBusinessDayKSTDateStr(key, holidays);

    let sum: number;
    if (leaveType === 'FULL_DAY') {
      sum = STANDARD_DAY_MINUTES; // Full day Leave = 8Time
    } else if (leaveType === 'HALF_DAY_AM' || leaveType === 'HALF_DAY_PM') {
      sum = net + HALF_DAY_CREDIT_MINUTES; // a half day is net work plus the credit
    } else {
      sum = net;
    }

    if (isHoliday) {
      holidaySum += sum;
    } else {
      weekdaySum += sum;
      baselineMinutes += STANDARD_DAY_MINUTES;
    }

    rows.push({
      date: formatDateLabel(key),
      workMinutes: gross,
      breakMinutes: brk,
      isHoliday,
      leaveLabel: leaveLabelFor(leaveType),
      sumMinutes: sum,
    });
  }

  return {
    rows,
    summary: {
      baselineMinutes,
      weekdaySumMinutes: weekdaySum,
      overtimeMinutes: weekdaySum - baselineMinutes,
      holidaySumMinutes: holidaySum,
      totalSumMinutes: weekdaySum + holidaySum,
    },
  };
}

const SESSION_INCLUDE = {
  sessions: { where: { deletedAt: null }, orderBy: { startAt: 'asc' as const } },
  breaks: { where: { deletedAt: null }, orderBy: { startAt: 'asc' as const } },
};

type RawAttendance = {
  memberId: number;
  status: SourceAttendance['status'];
  sessions: { startAt: Date; endAt: Date | null }[];
  breaks: { startAt: Date; endAt: Date | null }[];
};

function toSource(a: RawAttendance): SourceAttendance {
  return {
    status: a.status,
    sessions: a.sessions.map((s) => ({ startAt: s.startAt, endAt: s.endAt })),
    breaks: a.breaks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
  };
}

/**
 * The work-date range query. So a session that crossed midnight into the first day is not missed,
 * The lower bound reaches back a day. A session running past the upper bound falls outside the day keys anyway.
 */
function rangeBoundsUtc(range: ResolvedMonthRange): { gte: Date; lte: Date } {
  const gte = new Date(Date.parse(`${range.startKey}T00:00:00Z`) - DAY_MS);
  const lte = new Date(`${range.endKey}T00:00:00Z`);
  return { gte, lte };
}

export async function buildIndividualReport(params: {
  memberId: number;
  range: ResolvedMonthRange;
  now: Date;
}): Promise<IndividualReport | null> {
  const { memberId, range, now } = params;
  const member = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { id: true, name: true, position: true },
  });
  if (!member) return null;

  const { gte, lte } = rangeBoundsUtc(range);
  const [attendances, leaves, holidays] = await Promise.all([
    prisma.attendance.findMany({
      where: { memberId, workDate: { gte, lte }, deletedAt: null },
      include: SESSION_INCLUDE,
    }),
    prisma.leaveRequest.findMany({
      where: {
        memberId,
        status: 'APPROVED',
        startDate: { lte },
        endDate: { gte },
        deletedAt: null,
      },
      select: { type: true, startDate: true, endDate: true },
    }),
    getHolidaySet(range.startKey, range.endKey),
  ]);

  const { rows, summary } = computeReport(
    attendances.map(toSource),
    leaves,
    range,
    holidays,
    now,
  );
  return { member, yyyymm: range.yyyymm, rows, summary };
}

export async function buildOrgReport(params: {
  range: ResolvedMonthRange;
  now: Date;
}): Promise<OrgReport> {
  const { range, now } = params;
  const { gte, lte } = rangeBoundsUtc(range);

  const [members, attendances, leaves, holidays] = await Promise.all([
    prisma.member.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true },
    }),
    prisma.attendance.findMany({
      where: { workDate: { gte, lte }, deletedAt: null },
      include: SESSION_INCLUDE,
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte },
        endDate: { gte },
        deletedAt: null,
      },
      select: { memberId: true, type: true, startDate: true, endDate: true },
    }),
    getHolidaySet(range.startKey, range.endKey),
  ]);

  const attByMember = new Map<number, SourceAttendance[]>();
  for (const a of attendances) {
    const list = attByMember.get(a.memberId) ?? [];
    list.push(toSource(a));
    attByMember.set(a.memberId, list);
  }
  const leaveByMember = new Map<number, FetchedLeave[]>();
  for (const l of leaves) {
    const list = leaveByMember.get(l.memberId) ?? [];
    list.push({ type: l.type, startDate: l.startDate, endDate: l.endDate });
    leaveByMember.set(l.memberId, list);
  }

  const rows: OrgReportRow[] = members
    // The CEO is left out of the org totals. People with no position stay in.
    .filter((m) => m.position !== 'CEO')
    .map((m) => {
      const { summary } = computeReport(
        attByMember.get(m.id) ?? [],
        leaveByMember.get(m.id) ?? [],
        range,
        holidays,
        now,
      );
      return { name: m.name, position: m.position, summary };
    });

  return { yyyymm: range.yyyymm, rows };
}
