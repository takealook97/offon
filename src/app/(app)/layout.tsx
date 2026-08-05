import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { countPendingApprovals } from '@/lib/approvals';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const me = await prisma.member.findFirst({
    where: { id: session.memberId, deletedAt: null },
    select: { name: true, role: true },
  });
  if (!me) redirect('/login');

  // The approvals menu is admin-only, so the count is only fetched for admins.
  // The router.refresh() that follows an approval or rejection re-renders this layout too, so
  // handling the last item clears the badge without a page reload.
  const pendingApprovals = me.role === 'ADMIN' ? await countPendingApprovals() : 0;

  return (
    <AppShell me={me} pendingApprovals={pendingApprovals}>
      {children}
    </AppShell>
  );
}
