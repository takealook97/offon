import { prisma } from '@/lib/prisma';
import { todayKST, formatKST } from '@/lib/time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarX } from 'lucide-react';
import { CancelLeaveButton } from './CancelLeaveButton';

const TYPE_LABEL: Record<string, string> = {
  FULL_DAY: 'Full day',
  HALF_DAY_AM: 'Morning half day',
  HALF_DAY_PM: 'Afternoon half day',
};

// The leave category is down to two values in the database.
// The UI shows the friendly label; the internal term is not surfaced.
const CATEGORY_LABEL: Record<string, string> = {
  PUBLIC_DUTY: 'Public duty',
};

export async function MyLeavesCard({ memberId }: { memberId: number }) {
  const today = todayKST();
  const items = await prisma.leaveRequest.findMany({
    where: {
      memberId,
      status: { in: ['REQUESTED', 'APPROVED'] },
      startDate: { gte: today },
      deletedAt: null,
    },
    orderBy: { startDate: 'asc' },
    take: 20,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center gap-1.5">
          <CalendarX className="size-3.5" /> My requests
        </CardDescription>
        <CardTitle className="text-lg">Leave you can cancel</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="px-6 pb-6 pt-0 text-sm text-muted-foreground">
            Nothing to cancel
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((l) => {
              const range =
                formatKST(l.startDate, 'yyyy-MM-dd') === formatKST(l.endDate, 'yyyy-MM-dd')
                  ? formatKST(l.startDate, 'yyyy-MM-dd')
                  : `${formatKST(l.startDate, 'yyyy-MM-dd')} ~ ${formatKST(l.endDate, 'yyyy-MM-dd')}`;
              return (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    {l.status === 'APPROVED' ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      >
                        Approve
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        pending
                      </Badge>
                    )}
                    {l.category === 'PUBLIC_DUTY' && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-neutral-500/40 text-neutral-700 dark:text-neutral-300"
                      >
                        {CATEGORY_LABEL.PUBLIC_DUTY}
                      </Badge>
                    )}
                    <span className="truncate">
                      <span className="font-mono tabular-nums">{range}</span>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="text-muted-foreground">
                        {TYPE_LABEL[l.type]} ({Number(l.days)}Day)
                      </span>
                    </span>
                  </div>
                  <CancelLeaveButton id={l.id} wasApproved={l.status === 'APPROVED'} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
