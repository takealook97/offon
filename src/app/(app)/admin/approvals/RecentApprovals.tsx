import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type RecentStatus = 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type RecentItem =
  | {
      kind: 'leave';
      key: string;
      name: string;
      approverName: string | null;
      badgeLabel: string;
      range: string;
      days: number;
      status: RecentStatus;
    }
  | {
      kind: 'att';
      key: string;
      name: string;
      approverName: string | null;
      dateLabel: string;
      before: string;
      after: string;
      status: RecentStatus;
    };

function StatusBadge({ status }: { status: RecentStatus }) {
  if (status === 'APPROVED')
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
      >
        Approve
      </Badge>
    );
  if (status === 'REJECTED')
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-700 dark:text-red-300">
        Reject
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Cancelled
    </Badge>
  );
}

function KindBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="shrink-0">
      {label}
    </Badge>
  );
}

export function RecentApprovals({ items }: { items: RecentItem[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {items.map((it) => (
            <li key={it.key} className="space-y-2 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <KindBadge label={it.kind === 'leave' ? it.badgeLabel : 'Time correction'} />
                  <span className="font-medium">{it.name}</span>
                  <span className="text-border">·</span>
                  {it.kind === 'leave' ? (
                    <>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {it.range}
                      </span>
                      <span className="text-muted-foreground">({it.days}Day)</span>
                    </>
                  ) : (
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {it.dateLabel}
                    </span>
                  )}
                </div>
                <StatusBadge status={it.status} />
              </div>

              {it.kind === 'att' && (
                <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="w-9 shrink-0 text-xs text-muted-foreground">Was</span>
                    <span className="text-muted-foreground line-through">{it.before}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-9 shrink-0 text-xs text-muted-foreground">Now</span>
                    <span className="font-medium">{it.after}</span>
                  </div>
                </div>
              )}

              {it.approverName && (
                <p className="text-xs text-muted-foreground">Handled by: {it.approverName}</p>
              )}
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing handled yet
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
