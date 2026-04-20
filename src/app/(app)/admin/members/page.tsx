import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { MembersPanel, type MemberRow } from './MembersPanel';

export const revalidate = 60;

export default async function MembersPage() {
  await requireAdmin();
  const members = await prisma.member.findMany({
    orderBy: [
      { deletedAt: { sort: 'asc', nulls: 'first' } },
      { role: 'desc' },
      { name: 'asc' },
    ],
    include: { leaveBalance: true },
  });

  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    slackId: m.slackId,
    position: m.position,
    role: m.role,
    active: m.deletedAt === null,
    baseDays: m.leaveBalance ? Number(m.leaveBalance.baseDays) : 0,
    bonusDays: m.leaveBalance ? Number(m.leaveBalance.bonusDays) : 0,
    usedDays: m.leaveBalance ? Number(m.leaveBalance.usedDays) : 0,
  }));

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
