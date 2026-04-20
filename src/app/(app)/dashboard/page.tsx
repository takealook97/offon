import { Calendar, CalendarClock, Clock3, CalendarCheck, CalendarPlus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { formatKST, monthRangeKST, nowKST, todayKST, weekRangeKST } from '@/lib/time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionTimeline } from '@/components/SessionTimeline';
import { AttendanceActions } from './AttendanceActions';
import { LeaveRequestForm } from './LeaveRequestForm';

type SessionLite = { startAt: Date; endAt: Date | null };

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function progressOf(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export default async function DashboardPage() {
  const session = await requireSession();
  const today = todayKST();
  const week = weekRangeKST();
  const month = monthRangeKST();

  const [me, todayAttendance, weekRows, monthRows, balance, pending] = await Promise.all([
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { name: true },
    }),
    prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: session.memberId, workDate: today } },
      include: {
        sessions: {
          where: { deletedAt: null },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true },
        },
      },
    }),
    prisma.attendance.findMany({
      where: {
        memberId: session.memberId,
        workDate: { gte: week.start, lte: week.end },
        deletedAt: null,
      },
      select: { workedMinutes: true },
    }),
    prisma.attendance.findMany({
      where: {
        memberId: session.memberId,
        workDate: { gte: month.start, lte: month.end },
        deletedAt: null,
      },
      select: { workedMinutes: true },
    }),
    prisma.leaveBalance.findUnique({ where: { memberId: session.memberId } }),
    prisma.leaveRequest.aggregate({
      where: { memberId: session.memberId, status: 'REQUESTED', deletedAt: null },
      _sum: { days: true },
    }),
  ]);

  const sessions: SessionLite[] = todayAttendance?.sessions ?? [];
  const firstIn = sessions[0]?.startAt ?? todayAttendance?.clockInAt ?? null;
  const closedEndAts = sessions.filter((s) => s.endAt).map((s) => s.endAt!);
  const lastOut = closedEndAts.length
    ? closedEndAts.reduce((a, b) => (a > b ? a : b))
    : todayAttendance?.clockOutAt ?? null;
  const openSession = sessions.find((s) => !s.endAt) ?? null;
  const isWorking = todayAttendance?.status === 'WORKING' && !!openSession;
  const storedWorked = todayAttendance?.workedMinutes ?? 0;
  const liveDelta = openSession
    ? Math.max(0, Math.floor((Date.now() - openSession.startAt.getTime()) / 60000))
    : 0;
  const todayWorked = storedWorked + liveDelta;

  const weekTotal = weekRows.reduce((s, r) => s + r.workedMinutes, 0) + (isWorking ? liveDelta : 0);
  const monthTotal = monthRows.reduce((s, r) => s + r.workedMinutes, 0) + (isWorking ? liveDelta : 0);
  const totalDays = balance ? Number(balance.totalDays) : 0;
  const usedDays = balance ? Number(balance.usedDays) : 0;
  const pendingDays = pending._sum.days ? Number(pending._sum.days) : 0;
  const remainingDays = totalDays - usedDays;
  const availableDays = remainingDays - pendingDays;

  const weekProgress = progressOf(weekTotal, 40 * 60);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          {formatKST(nowKST(), 'EEEE, d MMMM yyyy')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Hello, {me?.name ?? ''}
        </h1>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div className="space-y-1">
            <CardDescription className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> Today
            </CardDescription>
            <CardTitle className="text-xl">
              {todayAttendance?.status === 'DONE'
                ? 'Clocked out'
                : todayAttendance?.status === 'WORKING'
                ? 'Working'
                : todayAttendance?.status === 'MISSING'
                ? 'Missing'
                : 'Not started'}
            </CardTitle>
          </div>
          <AttendanceStatusBadge status={todayAttendance?.status ?? 'NOT_STARTED'} />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-border/60 bg-muted/40 p-4">
            <ClockSlot
              label="Clock in"
              value={firstIn ? formatKST(firstIn, 'HH:mm') : '—'}
            />
            <ClockSlot
              label="Clock out"
              value={
                isWorking
                  ? 'In progress'
                  : lastOut
                  ? formatKST(lastOut, 'HH:mm')
                  : '—'
              }
            />
            <ClockSlot
              label="Worked"
              value={firstIn ? formatMinutes(todayWorked) : '—'}
            />
          </div>
          <AttendanceActions isWorking={isWorking} />
          <SessionTimeline sessions={sessions} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Clock3}
          label="This week"
          value={formatMinutes(weekTotal)}
          sub={`${weekProgress}% of the weekly target`}
          progress={weekProgress}
        />
        <StatCard
          icon={Calendar}
          label="This month"
          value={formatMinutes(monthTotal)}
          sub={`${monthRows.length}Day Working`}
        />
        <StatCard
          icon={CalendarCheck}
          label="Leave remaining"
          value={`${remainingDays}Day`}
          sub={
            pendingDays > 0
              ? `${totalDays} granted · ${usedDays} used · ${pendingDays} pending`
              : `${totalDays} granted · ${usedDays} used`
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <CalendarPlus className="size-3.5" /> Request leave
          </CardDescription>
          <CardTitle className="text-lg">Request leave</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestForm availableDays={availableDays} />
        </CardContent>
      </Card>
    </div>
  );
}

function ClockSlot({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
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
        {progress !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceStatusBadge({
  status,
}: {
  status: 'NOT_STARTED' | 'WORKING' | 'DONE' | 'MISSING';
}) {
  if (status === 'WORKING')
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-500" />
        Working
      </Badge>
    );
  if (status === 'DONE')
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        Done
      </Badge>
    );
  if (status === 'MISSING')
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-700 dark:text-red-300">
        Missing
      </Badge>
    );
  return <Badge variant="secondary">pending</Badge>;
}
