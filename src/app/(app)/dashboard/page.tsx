import { Calendar, CalendarClock, Clock3, CalendarCheck, CalendarPlus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
  formatZoned,
  dayBoundsUtc,
  dayKey,
  monthRange,
  zonedToday,
  todayKey,
  weekRange,
} from '@/lib/time';
import { clippedDailyTotals } from '@/lib/calendar-aggregation';
import type { DailyAttendanceTotal } from '@/lib/api-types';
import { listHolidays } from '@/lib/holidays';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionTimeline } from '@/components/SessionTimeline';
import { getT, getLocale } from '@/lib/i18n/server';
import { AttendanceActions } from './AttendanceActions';
import { RangeWorked, RangeWorkedDays, TodayWorked, type LiveRow } from './LiveWorked';
import { BreakDuration } from './BreakDuration';
import { LunchDuration } from './LunchDuration';
import { LeaveRequestForm } from './LeaveRequestForm';
import { MyLeavesCard } from './MyLeavesCard';

type SessionLite = { startAt: Date; endAt: Date | null };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function sumMinutesInRange(
  totals: Record<string, DailyAttendanceTotal>,
  start: Date,
  end: Date,
): number {
  if (start.getTime() > end.getTime()) return 0;
  // start and end are local midnights. Enumerating day keys with a 24h step is safe in a zone with no DST.
  let total = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    total += totals[dayKey(new Date(t))]?.workedMinutes ?? 0;
  }
  return total;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const t = await getT();
  const today = zonedToday();
  const week = weekRange();
  const month = monthRange();
  // clippedDailyTotals needs a real UTC instant. zonedNow() is a shifted sentinel, and using
  // it to clamp an open session inflates the worked time by the whole offset.
  const now = new Date();

  const todayStr = todayKey();
  const year = Number(todayStr.slice(0, 4));
  const holidayFrom = `${year}-01-01`;
  const holidayTo = `${year + 1}-12-31`;

  // The cutoff for leave already committed: approved leave ending on or after today.
  // leave_requests.endDate is a @db.Date at midnight UTC, so the comparison value matches that shape.
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayUtcDate = new Date(Date.UTC(ty, tm - 1, td));

  // Loads attendance with its sessions and breaks over a range one day wider on each side,
  // so the week total, the month total and today's clip can all be computed in one pass.
  // The extra day catches a session that crossed midnight and is anchored to a row outside the range.
  const loadStartMs =
    Math.min(week.start.getTime(), month.start.getTime(), today.getTime()) - MS_PER_DAY;
  const loadEndMs =
    Math.max(week.end.getTime(), month.end.getTime(), today.getTime()) + MS_PER_DAY;
  const loadStart = new Date(loadStartMs);
  const loadEnd = new Date(loadEndMs);

  const [
    me,
    rangeRows,
    activeOpenRow,
    balance,
    pending,
    scheduled,
    holidayRows,
  ] = await Promise.all([
    prisma.member.findFirst({
      where: { id: session.memberId, deletedAt: null },
      select: { name: true },
    }),
    prisma.attendance.findMany({
      where: {
        memberId: session.memberId,
        workDate: { gte: loadStart, lte: loadEnd },
        deletedAt: null,
      },
      include: {
        sessions: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true },
        },
        breaks: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true, kind: true },
        },
      },
    }),
    // Guards against an open session left dangling outside the range above.
    prisma.attendance.findFirst({
      where: {
        memberId: session.memberId,
        deletedAt: null,
        sessions: { some: { endAt: null, deletedAt: null } },
      },
      include: {
        sessions: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true },
        },
        breaks: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true, kind: true },
        },
      },
    }),
    prisma.leaveBalance.findFirst({ where: { memberId: session.memberId, deletedAt: null } }),
    prisma.leaveRequest.aggregate({
      where: { memberId: session.memberId, status: 'REQUESTED', deletedAt: null },
      _sum: { days: true },
    }),
    prisma.leaveRequest.aggregate({
      where: {
        memberId: session.memberId,
        status: 'APPROVED',
        deletedAt: null,
        endDate: { gte: todayUtcDate },
      },
      _sum: { days: true },
    }),
    listHolidays({ from: holidayFrom, to: holidayTo }),
  ]);
  const holidayDates = holidayRows.map((h) => h.date);

  type Row = (typeof rangeRows)[number];
  const rowsById = new Map<number, Row>();
  for (const r of rangeRows) rowsById.set(r.id, r);
  if (activeOpenRow && !rowsById.has(activeOpenRow.id)) {
    rowsById.set(activeOpenRow.id, activeOpenRow);
  }
  const allRows: Row[] = Array.from(rowsById.values());
  const dailyTotals = clippedDailyTotals(
    allRows.map((a) => ({
      status: a.status,
      sessions: a.sessions,
      breaks: a.breaks,
    })),
    now,
  );

  const todayWorked = dailyTotals[todayStr]?.workedMinutes ?? 0;
  const weekTotal = sumMinutesInRange(dailyTotals, week.start, week.end);
  const monthTotal = sumMinutesInRange(dailyTotals, month.start, month.end);

  function countWorkedDays(start: Date, end: Date): number {
    if (start.getTime() > end.getTime()) return 0;
    let count = 0;
    for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
      const minutes = dailyTotals[dayKey(new Date(t))]?.workedMinutes ?? 0;
      if (minutes > 0) count += 1;
    }
    return count;
  }
  const weekDaysWorked = countWorkedDays(week.start, week.end);
  const monthDaysWorked = countWorkedDays(month.start, month.end);

  // The browser recomputes today every minute, so it is subtracted from the server total and passed as a base.
  // Today always falls inside this week and this month, so subtracting is exact.
  const todayWorkedDay = todayWorked > 0 ? 1 : 0;
  const weekBaseMinutes = weekTotal - todayWorked;
  const monthBaseMinutes = monthTotal - todayWorked;
  const weekBaseDays = weekDaysWorked - todayWorkedDay;
  const monthBaseDays = monthDaysWorked - todayWorkedDay;

  // Only rows touching today go to the client, including yesterday's session if it crossed midnight.
  const todayBounds = dayBoundsUtc(todayStr);
  const touchesToday = (segments: { startAt: Date; endAt: Date | null }[]) =>
    segments.some((seg) => {
      const segEnd = seg.endAt ?? now;
      return (
        seg.startAt.getTime() < todayBounds.end.getTime() &&
        segEnd.getTime() > todayBounds.start.getTime()
      );
    });
  const liveRows: LiveRow[] = allRows
    .filter((r) => touchesToday(r.sessions) || touchesToday(r.breaks))
    .map((r) => ({
      status: r.status,
      sessions: r.sessions.map((x) => ({
        startAt: x.startAt.toISOString(),
        endAt: x.endAt ? x.endAt.toISOString() : null,
      })),
      breaks: r.breaks.map((x) => ({
        startAt: x.startAt.toISOString(),
        endAt: x.endAt ? x.endAt.toISOString() : null,
      })),
    }));

  // Data for the \"today\" card.
  const todayRow =
    allRows.find((r) => dayKey(r.workDate) === todayStr) ?? null;
  const status = (activeOpenRow?.status ?? todayRow?.status ?? 'NOT_STARTED') as
    | 'NOT_STARTED'
    | 'WORKING'
    | 'ON_BREAK'
    | 'DONE'
    | 'MISSING';
  const isWorking = status === 'WORKING';
  const isOnBreak = status === 'ON_BREAK';
  const isCrossMidnightActive =
    !!activeOpenRow && dayKey(activeOpenRow.workDate) !== todayStr;
  const sessions: SessionLite[] = todayRow?.sessions ?? [];

  // The start of the open break while the status is ON_BREAK, as a UTC ISO string.
  const onBreakRow = isOnBreak
    ? activeOpenRow?.status === 'ON_BREAK'
      ? activeOpenRow
      : todayRow?.status === 'ON_BREAK'
        ? todayRow
        : null
    : null;
  const breakStartedAt =
    onBreakRow?.breaks.find((b) => b.endAt === null)?.startAt.toISOString() ?? null;

  // A meal leaves the status at working, so if a meal break's end has not arrived yet,
  // being on a meal is derived from it. Clocking out is blocked during one, so such a break only exists on an active day.
  const ongoingLunch =
    allRows
      .flatMap((r) => r.breaks)
      .find(
        (b) => b.kind === 'LUNCH' && b.endAt !== null && b.endAt.getTime() > now.getTime(),
      ) ?? null;
  const isOnLunch = !!ongoingLunch;
  const lunchStartedAt = ongoingLunch?.startAt.toISOString() ?? null;
  const lunchEndsAt = ongoingLunch?.endAt?.toISOString() ?? null;

  // The clock-in label prefers today's own value, falling back to midnight when today's worked time came from a session that crossed it.
  let clockInLabel: string;
  if (todayRow?.clockInAt) {
    clockInLabel = formatZoned(todayRow.clockInAt, 'HH:mm');
  } else if (isCrossMidnightActive || todayWorked > 0) {
    clockInLabel = '00:00';
  } else {
    clockInLabel = '—';
  }

  // The clock-out label reads as in progress while working, otherwise today's value, otherwise yesterday's end where it crossed midnight.
  let clockOutLabel: string;
  if (isWorking) {
    clockOutLabel = t('status.inProgress');
  } else if (todayRow?.clockOutAt) {
    clockOutLabel = formatZoned(todayRow.clockOutAt, 'HH:mm');
  } else {
    const todayEndMs = today.getTime() + MS_PER_DAY;
    let crossEnd: Date | null = null;
    for (const r of allRows) {
      if (dayKey(r.workDate) === todayStr) continue;
      for (const s of r.sessions) {
        if (!s.endAt) continue;
        const endMs = s.endAt.getTime();
        if (endMs > today.getTime() && endMs <= todayEndMs) {
          if (!crossEnd || endMs > crossEnd.getTime()) crossEnd = s.endAt;
        }
      }
    }
    clockOutLabel = crossEnd ? formatZoned(crossEnd, 'HH:mm') : '—';
  }
  const hasClockIn = clockInLabel !== '—';

  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const baseDays = balance ? safe(Number(balance.baseDays)) : 0;
  const bonusDays = balance ? safe(Number(balance.bonusDays)) : 0;
  const usedDays = balance ? safe(Number(balance.usedDays)) : 0;
  const pendingDays = pending._sum.days ? safe(Number(pending._sum.days)) : 0;
  const scheduledDays = scheduled._sum.days ? safe(Number(scheduled._sum.days)) : 0;
  const consumedDays = Math.max(0, usedDays - scheduledDays);
  const totalDays = baseDays + bonusDays;
  const remainingDays = totalDays - usedDays;
  const availableDays = remainingDays - pendingDays;


  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          {formatZoned(new Date(), 'yyyy-MM-dd (EEEE)', await getLocale())}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {t('dashboard.greeting', { name: me?.name ?? '' })}
        </h1>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div className="space-y-1">
            <CardDescription className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> {t('dashboard.today')}
            </CardDescription>
            <CardTitle className="text-xl">
              {isOnLunch
                ? t('status.onMeal')
                : status === 'DONE'
                ? t('status.done')
                : status === 'WORKING'
                ? t('status.working')
                : status === 'ON_BREAK'
                ? t('status.onBreak')
                : status === 'MISSING'
                ? t('status.missing')
                : t('status.notStarted')}
            </CardTitle>
          </div>
          <AttendanceStatusBadge
            status={status}
            breakStartedAt={breakStartedAt}
            lunchStartedAt={lunchStartedAt}
            lunchEndsAt={lunchEndsAt}
          />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-border/60 bg-muted/40 p-4">
            <ClockSlot label={t('attendance.clockIn')} value={clockInLabel} />
            <ClockSlot
              label={isOnLunch ? t('attendance.meal') : isOnBreak ? t('attendance.away') : t('attendance.clockOut')}
              value={isOnLunch || isOnBreak ? t('status.inProgress') : clockOutLabel}
            />
            <ClockSlot
              label={t('dashboard.workTime')}
              value={<TodayWorked rows={liveRows} dayKey={todayStr} hasClockIn={hasClockIn} />}
            />
          </div>
          <AttendanceActions status={status} lunchEndsAt={lunchEndsAt} />
          <SessionTimeline sessions={sessions} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Clock3}
          label={t('dashboard.thisWeek')}
          value={<RangeWorked rows={liveRows} dayKey={todayStr} baseMinutes={weekBaseMinutes} />}
          sub={
            <RangeWorkedDays
              rows={liveRows}
              dayKey={todayStr}
              baseDays={weekBaseDays}
              emptyLabel={t('dashboard.noRecord')}
            />
          }
        />
        <StatCard
          icon={Calendar}
          label={t('dashboard.thisMonth')}
          value={<RangeWorked rows={liveRows} dayKey={todayStr} baseMinutes={monthBaseMinutes} />}
          sub={<RangeWorkedDays rows={liveRows} dayKey={todayStr} baseDays={monthBaseDays} />}
        />
        <StatCard
          icon={CalendarCheck}
          label={t('dashboard.leaveRemaining')}
          value={t('duration.days', { days: remainingDays })}
          sub={
            t('dashboard.leaveBreakdown', { base: baseDays, bonus: bonusDays, scheduled: scheduledDays, consumed: consumedDays }) +
            (pendingDays > 0 ? t('dashboard.leavePending', { pending: pendingDays }) : '')
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <CalendarPlus className="size-3.5" /> {t('leave.request')}
          </CardDescription>
          <CardTitle className="text-lg">{t('leave.request')}</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestForm
            availableDays={availableDays}
            holidayDates={holidayDates}
            todayStr={todayStr}
          />
        </CardContent>
      </Card>

      <MyLeavesCard memberId={session.memberId} />
    </div>
  );
}

function ClockSlot({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-nowrap font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

async function AttendanceStatusBadge({
  status,
  breakStartedAt,
  lunchStartedAt,
  lunchEndsAt,
}: {
  status: 'NOT_STARTED' | 'WORKING' | 'ON_BREAK' | 'DONE' | 'MISSING';
  breakStartedAt?: string | null;
  lunchStartedAt?: string | null;
  lunchEndsAt?: string | null;
}) {
  const t = await getT();
  // A meal does not change the stored status, so it is checked before the away state.
  if (lunchStartedAt && lunchEndsAt)
    return (
      <Badge variant="outline" className="border-violet-500/40 text-violet-700 dark:text-violet-300">
        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-violet-500" />
        <LunchDuration startedAt={lunchStartedAt} endsAt={lunchEndsAt} />
      </Badge>
    );
  if (status === 'WORKING')
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-500" />
        {t('status.working')}
      </Badge>
    );
  if (status === 'ON_BREAK')
    return (
      <Badge variant="outline" className="border-sky-500/40 text-sky-700 dark:text-sky-300">
        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-sky-500" />
        {breakStartedAt ? <BreakDuration startedAt={breakStartedAt} /> : t('status.onBreak')}
      </Badge>
    );
  if (status === 'DONE')
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        {t('status.complete')}
      </Badge>
    );
  if (status === 'MISSING')
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-700 dark:text-red-300">
        {t('status.missing')}
      </Badge>
    );
  return <Badge variant="secondary">{t('status.pending')}</Badge>;
}
