import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LeaveActions } from './LeaveActions';
import { AttendanceEditActions } from './AttendanceEditActions';
import { getT } from '@/lib/i18n/server';

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

export async function PendingList({ rows }: { rows: PendingRow[] }) {
  const t = await getT();
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          {t('appr.none')}
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

async function LeaveCard({ row }: { row: LeaveRow }) {
  const t = await getT();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-blue-500/40 text-blue-700 dark:text-blue-300"
              >
                {row.days === 0.5 ? row.typeLabel : t('appr.leave')}
              </Badge>
              <span className="font-medium">{row.name}</span>
              {row.position && (
                <span className="text-xs text-muted-foreground">{row.position}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">{row.range}</span>
              <span className="mx-1.5 text-border">·</span>
              {t('duration.days', { days: row.days })}
            </p>
          </div>
        </div>
        <LeaveActions id={row.id} />
      </CardContent>
    </Card>
  );
}

async function AttCard({ row }: { row: AttRow }) {
  const t = await getT();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              >
                {t('appr.attendanceEdit')}
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
            <span className="w-9 shrink-0 text-xs text-muted-foreground">{t('appr.before')}</span>
            <span className="text-muted-foreground line-through">{row.before}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-9 shrink-0 text-xs text-muted-foreground">{t('appr.after')}</span>
            <span className="font-medium">{row.after}</span>
          </div>
        </div>

        {row.reason && <p className="text-sm text-muted-foreground">{t('appr.reasonLabel', { reason: row.reason })}</p>}

        <div className="flex justify-end">
          <AttendanceEditActions id={row.id} />
        </div>
      </CardContent>
    </Card>
  );
}
