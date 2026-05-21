'use client';

import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { kstClipSegmentLabel } from '@/lib/time';
import type { CalendarEvent, DailyAttendanceTotal } from '@/lib/api-types';

type UiEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEvent['resource'];
};

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0 && mm > 0) return `${h}h ${mm}m`;
  if (h > 0) return `${h}h`;
  return `${mm}m`;
}

type EventMeta = { typeLabel: string; dot: string };

// The dot colours match the grid's event colours (rbc-event-* in globals.css), so the modal
// and the calendar read as the same thing. The rows themselves stay neutral, like everything else.
function eventMeta(ev: UiEvent): EventMeta {
  if (ev.resource.kind === 'ATTENDANCE') {
    return { typeLabel: 'Working', dot: 'bg-emerald-500' };
  }
  if (ev.resource.kind === 'LEAVE') {
    const requested = ev.resource.leaveStatus === 'REQUESTED';
    const full = ev.resource.leaveType === 'FULL_DAY';
    const base = full ? 'Leave' : 'Half day';
    return {
      typeLabel: requested ? `${base} · pending` : base,
      dot: requested ? 'bg-amber-500' : full ? 'bg-blue-500' : 'bg-violet-500',
    };
  }
  return { typeLabel: 'Missing', dot: 'bg-red-500' };
}

function SummaryStats({ summary }: { summary: DailyAttendanceTotal }) {
  const { workedMinutes: worked, breakMinutes: brk } = summary;
  // Time on the clock is the worked total plus the breaks.
  const sessionSpan = worked + brk;
  return (
    <div className="grid grid-cols-3 divide-x divide-border/60 rounded-lg border border-border/60 bg-muted/40 py-2.5">
      <Stat label="Worked" value={formatMinutes(sessionSpan)} />
      <Stat label="Away" value={formatMinutes(brk)} />
      <Stat label="Total" value={formatMinutes(worked)} strong />
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="px-2 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm tabular-nums',
          strong ? 'font-semibold text-foreground' : 'font-medium',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ShowMoreDialog({
  open,
  onOpenChange,
  date,
  events,
  summary,
  canEdit = false,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: Date | null;
  events: UiEvent[];
  summary?: DailyAttendanceTotal;
  canEdit?: boolean;
  onEdit?: (sessionId: number) => void;
}) {
  const dayKey = date ? format(date, 'yyyy-MM-dd') : null;
  const now = new Date();

  const titleFor = (e: UiEvent): string => {
    if (e.resource.kind !== 'ATTENDANCE' || !dayKey) return e.title;
    const segEnd: Date | null = e.resource.isOpenSession ? null : e.end;
    const { startLabel, endLabel, minutes } = kstClipSegmentLabel(e.start, segEnd, dayKey, {
      now,
    });
    return `${startLabel} ~ ${endLabel} · ${formatMinutes(minutes)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {date ? format(date, 'MMonth dDay (EEEE)', { locale: ko }) : ''}
          </DialogTitle>
        </DialogHeader>

        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing on this day</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            <ul className="space-y-1.5">
              {events.map((e) => {
                const meta = eventMeta(e);
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2"
                  >
                    <span
                      className={cn('size-2 shrink-0 rounded-full', meta.dot)}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm tabular-nums">
                      {titleFor(e)}
                    </span>
                    {canEdit &&
                      e.resource.kind === 'ATTENDANCE' &&
                      e.resource.sessionId != null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit?.(e.resource.sessionId!)}
                          className="h-7 shrink-0 gap-1 px-2 text-xs"
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      )}
                  </li>
                );
              })}
            </ul>
            {summary && <SummaryStats summary={summary} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
