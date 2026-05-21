import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LeaveActions } from './LeaveActions';
import { AttendanceEditActions } from './AttendanceEditActions';

export type LeaveRow = {
  kind: 'leave';
  id: number;
  name: string;
  position: string | null;
  range: string;
  typeLabel: string;
  days: number;
};
export type AttRow = {
  kind: 'att';
  id: number;
  name: string;
  position: string | null;
  dateLabel: string;
  before: string;
  after: string;
  reason: string | null;
};
export type PendingRow = LeaveRow | AttRow;

export function PendingList({ rows }: { rows: PendingRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          Nothing waiting for approval
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {rows.map((row) =>
        row.kind === 'leave' ? (
          <LeaveCard key={`l${row.id}`} row={row} />
        ) : (
          <AttCard key={`a${row.id}`} row={row} />
        ),
      )}
    </div>
  );
}

function LeaveCard({ row }: { row: LeaveRow }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Avatar name={row.name} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-blue-500/40 text-blue-700 dark:text-blue-300"
              >
                Leave
              </Badge>
              <span className="font-medium">{row.name}</span>
              {row.position && (
                <span className="text-xs text-muted-foreground">{row.position}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">{row.range}</span>
              <span className="mx-1.5 text-border">·</span>
              {row.typeLabel} · {row.days}d
            </p>
          </div>
        </div>
        <LeaveActions id={row.id} />
      </CardContent>
    </Card>
  );
}

function AttCard({ row }: { row: AttRow }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Avatar name={row.name} />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              >
                Attendance correction
              </Badge>
              <span className="font-medium">{row.name}</span>
              {row.position && (
                <span className="text-xs text-muted-foreground">{row.position}</span>
              )}
            </div>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">{row.dateLabel}</p>
          </div>
        </div>

        <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <div className="flex gap-2">
            <span className="w-9 shrink-0 text-xs text-muted-foreground">Was</span>
            <span className="text-muted-foreground line-through">{row.before}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-9 shrink-0 text-xs text-muted-foreground">Now</span>
            <span className="font-medium">{row.after}</span>
          </div>
        </div>

        {row.reason && <p className="text-sm text-muted-foreground">Reason: {row.reason}</p>}

        <div className="flex justify-end">
          <AttendanceEditActions id={row.id} />
        </div>
      </CardContent>
    </Card>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
      {name.slice(0, 1)}
    </span>
  );
}
