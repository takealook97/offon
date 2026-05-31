import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { formatKST } from '@/lib/time';
import { asTimeline, formatTimelineSummary } from '@/lib/attendance-edit';
import { Badge } from '@/components/ui/badge';
import { PendingList, type PendingRow } from './PendingList';
import { RecentApprovals, type RecentItem } from './RecentApprovals';

export const dynamic = 'force-dynamic';

const RECENT_TAKE = 20;

const TYPE_LABEL: Record<string, string> = {
  FULL_DAY: 'Full day',
  HALF_DAY_AM: 'Morning half day',
  HALF_DAY_PM: 'Afternoon half day',
};

export default async function ApprovalsPage() {
  await requireAdmin();

  const [leavePending, leaveRecent, attPending, attRecent] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: 'REQUESTED', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { member: { select: { name: true, position: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] }, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: RECENT_TAKE,
      include: { member: { select: { name: true } }, approver: { select: { name: true } } },
    }),
    prisma.attendanceEditRequest.findMany({
      where: { status: 'REQUESTED', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { member: { select: { name: true, position: true } } },
    }),
    prisma.attendanceEditRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] }, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: RECENT_TAKE,
      include: { member: { select: { name: true } }, approver: { select: { name: true } } },
    }),
  ]);

  // Pending leave and pending corrections merged into one list, oldest first.
  const leaveTmp = leavePending.map((l) => ({
    at: l.createdAt.getTime(),
    row: {
      kind: 'leave',
      id: l.id,
      name: l.member.name,
      position: l.member.position,
      range: `${formatKST(l.startDate, 'yyyy-MM-dd')} ~ ${formatKST(l.endDate, 'yyyy-MM-dd')}`,
      typeLabel: TYPE_LABEL[l.type] ?? l.type,
      days: Number(l.days),
    } satisfies PendingRow,
  }));
  const attTmp = attPending.map((r) => {
    const before = asTimeline(r.snapshot);
    const after = asTimeline(r.proposed);
    return {
      at: r.createdAt.getTime(),
      row: {
        kind: 'att',
        id: r.id,
        name: r.member.name,
        position: r.member.position,
        dateLabel: formatKST(new Date(before.startAt), 'yyyy-MM-dd (EEE)'),
        before: formatTimelineSummary(before),
        after: formatTimelineSummary(after),
        reason: r.reason,
      } satisfies PendingRow,
    };
  });
  const rows: PendingRow[] = [...leaveTmp, ...attTmp].sort((a, b) => a.at - b.at).map((x) => x.row);

  // Recently handled leave and corrections merged into one list, most recently updated first, capped at twenty.
  const leaveRecentTmp = leaveRecent.map((l) => ({
    at: l.updatedAt.getTime(),
    item: {
      kind: 'leave',
      key: `leave-${l.id}`,
      name: l.member.name,
      approverName: l.approver?.name ?? null,
      badgeLabel: l.type === 'FULL_DAY' ? 'Leave' : TYPE_LABEL[l.type] ?? 'Leave',
      range: `${formatKST(l.startDate, 'yyyy-MM-dd')} ~ ${formatKST(l.endDate, 'yyyy-MM-dd')}`,
      days: Number(l.days),
      status: l.status as 'APPROVED' | 'REJECTED' | 'CANCELLED',
    } satisfies RecentItem,
  }));
  const attRecentTmp = attRecent.map((r) => {
    const before = asTimeline(r.snapshot);
    const after = asTimeline(r.proposed);
    return {
      at: r.updatedAt.getTime(),
      item: {
        kind: 'att',
        key: `att-${r.id}`,
        name: r.member.name,
        approverName: r.approver?.name ?? null,
        dateLabel: formatKST(new Date(before.startAt), 'yyyy-MM-dd (EEE)'),
        before: formatTimelineSummary(before),
        after: formatTimelineSummary(after),
        status: r.status as 'APPROVED' | 'REJECTED' | 'CANCELLED',
      } satisfies RecentItem,
    };
  });
  const recentItems: RecentItem[] = [...leaveRecentTmp, ...attRecentTmp]
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_TAKE)
    .map((x) => x.item);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">{rows.length} waiting</p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Waiting</h2>
          {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
        </div>
        <PendingList rows={rows} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Recently handled</h2>
        <RecentApprovals items={recentItems} />
      </section>
    </div>
  );
}
