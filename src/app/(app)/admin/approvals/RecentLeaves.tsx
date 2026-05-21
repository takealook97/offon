import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export type LeaveRecentItem = {
  id: number;
  name: string;
  approverName: string | null;
  range: string;
  days: number;
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
};

export function RecentLeaves({ items }: { items: LeaveRecentItem[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {l.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{l.name}</span>
                    <span className="mx-1.5 text-border">·</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{l.range}</span>
                    <span className="ml-1.5 text-muted-foreground">({l.days}Day)</span>
                  </p>
                  {l.approverName && (
                    <p className="text-xs text-muted-foreground">Handled by: {l.approverName}</p>
                  )}
                </div>
              </div>
              {l.status === 'APPROVED' ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                >
                  Approve
                </Badge>
              ) : l.status === 'REJECTED' ? (
                <Badge variant="outline" className="border-red-500/40 text-red-700 dark:text-red-300">
                  Reject
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Cancelled
                </Badge>
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
