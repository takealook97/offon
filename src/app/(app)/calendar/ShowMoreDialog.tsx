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
import type { CalendarEvent } from '@/lib/api-types';

type UiEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEvent['resource'];
};

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

export function ShowMoreDialog({
  open,
  onOpenChange,
  date,
  events,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: Date | null;
  events: UiEvent[];
}) {
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
            events.map((e) => (
              <li
                key={e.id}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium',
                  eventClass(e),
                )}
              >
                {e.title}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
