import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const me = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { name: true, role: true },
  });
  if (!me) redirect('/login');

  return <AppShell me={me}>{children}</AppShell>;
}
