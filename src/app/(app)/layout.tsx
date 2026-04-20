import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { LogoutButton } from '@/components/LogoutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const me = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { name: true, role: true },
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold">offon</Link>
          <Link href="/dashboard" className="text-zinc-600 hover:underline dark:text-zinc-400">대시보드</Link>
          <Link href="/calendar" className="text-zinc-600 hover:underline dark:text-zinc-400">캘린더</Link>
          {session.role === 'ADMIN' && (
            <>
              <Link href="/admin/members" className="text-zinc-600 hover:underline dark:text-zinc-400">직원 관리</Link>
              <Link href="/admin/leaves" className="text-zinc-600 hover:underline dark:text-zinc-400">연차 승인</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{me?.name}{session.role === 'ADMIN' && ' · 관리자'}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col p-6">{children}</main>
    </div>
  );
}
