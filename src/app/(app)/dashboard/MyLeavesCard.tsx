import { prisma } from '@/lib/prisma';
import { zonedToday, formatZoned } from '@/lib/time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarX } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { CancelLeaveButton } from './CancelLeaveButton';

const TYPE_KEY: Record<string, MessageKey> = {
  FULL_DAY: 'leave.fullDay',
  HALF_DAY_AM: 'leave.amHalf',
  HALF_DAY_PM: 'leave.pmHalf',
};

export async function MyLeavesCard({ memberId }: { memberId: number }) {
  const t = await getT();
  const today = zonedToday();
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
          <CalendarX className="size-3.5" /> {t('leave.myRequests')}
        </CardDescription>
        <CardTitle className="text-lg">{t('leave.cancellable')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="px-6 pb-6 pt-0 text-sm text-muted-foreground">
            {t('leave.noCancellable')}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((l) => {
              const range =
                formatZoned(l.startDate, 'yyyy-MM-dd') === formatZoned(l.endDate, 'yyyy-MM-dd')
                  ? formatZoned(l.startDate, 'yyyy-MM-dd')
                  : `${formatZoned(l.startDate, 'yyyy-MM-dd')} ~ ${formatZoned(l.endDate, 'yyyy-MM-dd')}`;
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
                        {t('status.approved')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        {t('status.pending')}
                      </Badge>
                    )}
                    <span className="truncate">
                      <span className="font-mono tabular-nums">{range}</span>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="text-muted-foreground">
                        {t(TYPE_KEY[l.type] ?? 'leave.fullDay')} ({t('duration.days', { days: Number(l.days) })})
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
