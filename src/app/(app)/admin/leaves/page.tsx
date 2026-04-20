import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

export const revalidate = 30;
import { formatKST } from '@/lib/time';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LeaveActions } from './LeaveActions';

const TYPE_LABEL: Record<string, string> = {
  FULL_DAY: '종일',
  HALF_DAY_AM: '오전 반차',
  HALF_DAY_PM: '오후 반차',
};

export default async function AdminLeavesPage() {
  await requireAdmin();
  const pending = await prisma.leaveRequest.findMany({
    where: { status: 'REQUESTED', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { member: { select: { name: true, position: true } } },
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">연차 승인</h1>
        <p className="text-sm text-muted-foreground">
          대기 {pending.length}건 · 최근 처리 {recent.length}건
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">대기 중</h2>
          {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
        </div>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              대기 중인 연차 신청이 없습니다
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {pending.map((l) => (
              <Card key={l.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Avatar name={l.member.name} />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.member.name}</span>
                        {l.member.position && (
                          <span className="text-xs text-muted-foreground">{l.member.position}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          {formatKST(l.startDate, 'yyyy-MM-dd')} ~ {formatKST(l.endDate, 'yyyy-MM-dd')}
                        </span>
                        <span className="mx-1.5 text-border">·</span>
                        {TYPE_LABEL[l.type]} · {Number(l.days)}일
                      </p>
                      {l.reason && (
                        <p className="truncate text-sm text-muted-foreground">사유: {l.reason}</p>
                      )}
                    </div>
                  </div>
                  <LeaveActions id={l.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">최근 처리</h2>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {recent.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={l.member.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{l.member.name}</span>
                        <span className="mx-1.5 text-border">·</span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {formatKST(l.startDate, 'MM-dd')} ~ {formatKST(l.endDate, 'MM-dd')}
                        </span>
                        <span className="ml-1.5 text-muted-foreground">({Number(l.days)}일)</span>
                      </p>
                      {l.approver && (
                        <p className="text-xs text-muted-foreground">처리자: {l.approver.name}</p>
                      )}
                    </div>
                  </div>
                  {l.status === 'APPROVED' ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    >
                      승인
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-red-500/40 text-red-700 dark:text-red-300"
                    >
                      반려
                    </Badge>
                  )}
                </li>
              ))}
              {recent.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  처리된 내역이 없습니다
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initial = name.slice(0, 1);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ${
        size === 'sm' ? 'size-7 text-xs' : 'size-10 text-sm'
      }`}
    >
      {initial}
    </span>
  );
}
