import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { kstDayKey } from '@/lib/time';
import { MembersPanel, type MemberRow } from './MembersPanel';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  await requireAdmin();

  // leave_requests.endDate is a @db.Date, midnight UTC of the calendar date.
  // Today's local date is turned into the same shape so the two compare directly.
  const todayStr = kstDayKey(new Date());
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td));

  const [members, scheduledRows] = await Promise.all([
    prisma.member.findMany({ include: { leaveBalance: true } }),
    prisma.leaveRequest.groupBy({
      by: ['memberId'],
      where: {
        status: 'APPROVED',
        deletedAt: null,
        endDate: { gte: todayUtc },
      },
      _sum: { days: true },
    }),
  ]);

  const scheduledByMember = new Map<number, number>();
  for (const s of scheduledRows) {
    scheduledByMember.set(s.memberId, Number(s._sum.days ?? 0));
  }

  const rows: MemberRow[] = members.map((m) => {
    const usedTotal = m.leaveBalance ? Number(m.leaveBalance.usedDays) : 0;
    const scheduled = scheduledByMember.get(m.id) ?? 0;
    const consumed = Math.max(0, usedTotal - scheduled);
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      slackId: m.slackId,
      position: m.position,
      role: m.role,
      excludeMissingNotify: m.excludeMissingNotify,
      active: m.deletedAt === null,
      baseDays: m.leaveBalance ? Number(m.leaveBalance.baseDays) : 0,
      bonusDays: m.leaveBalance ? Number(m.leaveBalance.bonusDays) : 0,
      usedDays: consumed,
      scheduledDays: scheduled,
    };
  });

  // Grouped: active admins, then active employees, then anyone deactivated.
  // Within each group, sorted by name using the locale's collation. The database's own
  // collation does not order non-Latin names correctly, so localeCompare does it here.
  const groupRank = (m: MemberRow): number => {
    if (!m.active) return 2;
    return m.role === 'ADMIN' ? 0 : 1;
  };
  rows.sort((a, b) => {
    const g = groupRank(a) - groupRank(b);
    if (g !== 0) return g;
    return a.name.localeCompare(b.name, 'ko');
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} people · {rows.filter((r) => r.active).length} active
          </p>
        </div>
      </header>
      <MembersPanel rows={rows} />
    </div>
  );
}
