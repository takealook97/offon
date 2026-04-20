import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { formatKST } from '@/lib/time';
import { LeaveActions } from './LeaveActions';

export default async function AdminLeavesPage() {
  await requireAdmin();
  const pending = await prisma.leaveRequest.findMany({
    where: { status: 'REQUESTED', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { member: { select: { name: true, email: true } } },
  });
  const recent = await prisma.leaveRequest.findMany({
    where: { status: { in: ['APPROVED', 'REJECTED'] }, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    include: {
      member: { select: { name: true } },
      approver: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">대기 중 ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">대기 중인 연차 신청이 없습니다</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-sm">
                  <div className="font-medium">
                    {l.member.name} — {l.type} · {Number(l.days)}일
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatKST(l.startDate, 'yyyy-MM-dd')} ~ {formatKST(l.endDate, 'yyyy-MM-dd')}
                    {l.reason && ` · ${l.reason}`}
                  </div>
                </div>
                <LeaveActions id={l.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">최근 처리</h2>
        <ul className="space-y-2 text-sm">
          {recent.map((l) => (
            <li key={l.id} className="flex items-center justify-between">
              <span>
                {l.member.name} · {formatKST(l.startDate, 'yyyy-MM-dd')}~{formatKST(l.endDate, 'yyyy-MM-dd')} ({Number(l.days)}일)
              </span>
              <span className={l.status === 'APPROVED' ? 'text-blue-600' : 'text-red-600'}>
                {l.status === 'APPROVED' ? '승인' : '반려'} · {l.approver?.name ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
