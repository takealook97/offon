import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { MembersTable } from './MembersTable';
import { CreateMemberForm } from './CreateMemberForm';

export default async function MembersPage() {
  await requireAdmin();
  const members = await prisma.member.findMany({
    where: { deletedAt: null },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { leaveBalance: true },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">Add member</h2>
        <CreateMemberForm />
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">An employee Agenda</h2>
        <MembersTable
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            slackId: m.slackId,
            position: m.position,
            role: m.role,
            active: m.active,
            totalDays: m.leaveBalance ? Number(m.leaveBalance.totalDays) : 0,
            usedDays: m.leaveBalance ? Number(m.leaveBalance.usedDays) : 0,
          }))}
        />
      </section>
    </div>
  );
}
