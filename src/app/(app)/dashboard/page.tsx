import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { formatKST, monthRangeKST, todayKST, weekRangeKST } from '@/lib/time';
import { AttendanceActions } from './AttendanceActions';
import { LeaveRequestForm } from './LeaveRequestForm';

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const today = todayKST();
  const week = weekRangeKST();
  const month = monthRangeKST();

  const [todayAttendance, weekRows, monthRows, balance] = await Promise.all([
    prisma.attendance.findUnique({
      where: { memberId_workDate: { memberId: session.sub, workDate: today } },
    }),
    prisma.attendance.findMany({
      where: { memberId: session.sub, workDate: { gte: week.start, lte: week.end }, deletedAt: null },
      select: { workedMinutes: true, overtimeMinutes: true },
    }),
    prisma.attendance.findMany({
      where: { memberId: session.sub, workDate: { gte: month.start, lte: month.end }, deletedAt: null },
      select: { workedMinutes: true, overtimeMinutes: true },
    }),
    prisma.leaveBalance.findUnique({ where: { memberId: session.sub } }),
  ]);

  const weekTotal = weekRows.reduce((s, r) => s + r.workedMinutes, 0);
  const weekOvertime = weekRows.reduce((s, r) => s + r.overtimeMinutes, 0);
  const monthTotal = monthRows.reduce((s, r) => s + r.workedMinutes, 0);
  const remaining = balance
    ? Number(balance.totalDays) - Number(balance.usedDays)
    : 0;

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-2">
      <Card title="Today">
        <div className="space-y-2 text-sm">
          <div>In: {todayAttendance?.clockInAt ? formatKST(todayAttendance.clockInAt, 'HH:mm') : '—'}</div>
          <div>Out: {todayAttendance?.clockOutAt ? formatKST(todayAttendance.clockOutAt, 'HH:mm') : '—'}</div>
          <div>Status: {todayAttendance?.status ?? 'NOT_STARTED'}</div>
          {todayAttendance?.clockOutAt && (
            <div>Worked: {formatMinutes(todayAttendance.workedMinutes)} (overtime {formatMinutes(todayAttendance.overtimeMinutes)})</div>
          )}
        </div>
        <AttendanceActions
          hasClockIn={!!todayAttendance?.clockInAt}
          hasClockOut={!!todayAttendance?.clockOutAt}
        />
      </Card>

      <Card title="This week">
        <div className="space-y-1 text-sm">
          <div>Total: {formatMinutes(weekTotal)}</div>
          <div>Overtime: {formatMinutes(weekOvertime)}</div>
        </div>
      </Card>

      <Card title="This month">
        <div className="text-sm">Total {formatMinutes(monthTotal)}</div>
      </Card>

      <Card title="Leave">
        <div className="space-y-1 text-sm">
          <div>Granted: {balance?.totalDays?.toString() ?? '0'}</div>
          <div>Used: {balance?.usedDays?.toString() ?? '0'}Day</div>
          <div className="font-medium">Remaining: {remaining}Day</div>
        </div>
      </Card>

      <div className="md:col-span-2">
        <Card title="Request leave">
          <LeaveRequestForm />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-500">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
