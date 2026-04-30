'use client';

import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

function eventClass(ev: UiEvent): string {
  if (ev.resource.kind === 'ATTENDANCE') {
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200';
  }
  if (ev.resource.kind === 'LEAVE') {
    if (ev.resource.leaveStatus === 'REQUESTED')
      return 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-200';
    if (ev.resource.leaveType === 'FULL_DAY')
      return 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-200';
    return 'border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-200';
  }
  return 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-200';
}

function AttendanceDaySummary({ summary }: { summary: DailyAttendanceTotal }) {
  const { workedMinutes: worked, breakMinutes: brk } = summary;
  // Time on the clock is the worked total plus the breaks.
  const sessionSpan = worked + brk;
  return (
    <li className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
      <div>
        <span className="text-muted-foreground">Worked</span>{' '}
        <span className="font-medium">{formatMinutes(sessionSpan)}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Away</span>{' '}
        <span className="font-medium">{formatMinutes(brk)}</span>
      </div>
      <div className="my-1 border-t border-border/60" aria-hidden />
      <div>
        <span className="text-muted-foreground">Total</span>{' '}
        <span className="font-medium">{formatMinutes(worked)}</span>
      </div>
    </li>
  );
}

export function ShowMoreDialog({
  open,
  onOpenChange,
  date,
  events,
  summary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: Date | null;
  events: UiEvent[];
  summary?: DailyAttendanceTotal;
}) {
  const dayKey = date ? format(date, 'yyyy-MM-dd') : null;
  const now = new Date();

  const titleFor = (e: UiEvent): string => {
    if (e.resource.kind !== 'ATTENDANCE' || !dayKey) return e.title;
    const segEnd: Date | null = e.resource.isOpenSession ? null : e.end;
    const { startLabel, endLabel, minutes } = kstClipSegmentLabel(
      e.start,
      segEnd,
      dayKey,
      { now },
    );
    return `${startLabel} ~ ${endLabel} · ${formatMinutes(minutes)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {date ? format(date, 'EEEE, d MMMM yyyy', { locale: ko }) : ''}
          </DialogTitle>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {events.length === 0 ? (
            <li className="py-4 text-center text-sm text-muted-foreground">
              Nothing on this day
            </li>
          ) : (
            <>
              {events.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    eventClass(e),
                  )}
                >
                  {titleFor(e)}
                </li>
              ))}
              {summary && <AttendanceDaySummary summary={summary} />}
            </>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
